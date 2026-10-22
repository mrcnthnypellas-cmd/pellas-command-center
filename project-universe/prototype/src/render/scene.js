import * as THREE from 'three';
import { BODIES } from '../data/bodies.js';
import { heliocentricPosition, orbitPath, geocentricMoonPosition, lunarPath } from '../sim/kepler.js';
import { auToScene, displayRadius, MOON_DISPLAY_DISTANCE } from '../sim/scale.js';
import { glowTexture } from './textures.js';
import { createStarfield } from './starfield.js';

const DEG = Math.PI / 180;
const ORBIT_REBUILD_DAYS = 3652.5; // refresh drawn orbits after ~10 simulated years

function atmosphereMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vP;
      void main() {
        vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP);
        float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
        float lit = smoothstep(-0.35, 0.45, dot(N, normalize(-vP)));
        float a = rim * lit * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

function ringGeometry(inner, outer) {
  const geo = new THREE.RingGeometry(inner, outer, 128, 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export class SolarScene {
  constructor(quality, maps) {
    this.scene = new THREE.Scene();
    this.quality = quality;
    this.maps = maps;
    this.bodies = new Map();
    this.orbitsBuiltDays = null;
    this.showOrbits = true;
    this.spinEnabled = true;
    this.selectedId = null;

    this.ambient = new THREE.AmbientLight(0xc4d2f0, 0.3);
    this.scene.add(this.ambient);
    this.sunLight = new THREE.PointLight(0xfff4e6, 2.4, 0, 0);
    this.scene.add(this.sunLight);
    // Soft light from the viewer's direction so the side you look at is never
    // black. Turned off in "Realistic" lighting, where night sides stay dark.
    this.headlight = new THREE.DirectionalLight(0xffffff, 0.75);
    this.scene.add(this.headlight, this.headlight.target);

    this.starfield = createStarfield(quality.stars);
    this.scene.add(this.starfield);

    this.orbitGroup = new THREE.Group();
    this.scene.add(this.orbitGroup);

    for (const def of BODIES) this.#createBody(def);
  }

  #createBody(def) {
    const q = this.quality;
    // The Sun is drawn smaller still, so the inner planets stay clear of it.
    const radius = displayRadius(def.physical.diameterKm) * (def.id === 'sun' ? 0.72 : 1);
    const anchor = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = (def.physical.axialTiltDeg || 0) * DEG;
    anchor.add(tilt);

    const segs = def.id === 'sun' ? 64 : q.sphereSegments;
    const geo = new THREE.SphereGeometry(radius, segs, Math.round(segs / 2));
    const map = this.maps[def.visual.texture];
    const mat = def.id === 'sun'
      ? new THREE.MeshBasicMaterial({ map, color: new THREE.Color(1.15, 1.08, 1.0) })
      : new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = def.id;
    tilt.add(mesh);

    const body = { def, anchor, tilt, mesh, radius, sizeMul: 1, orbitRate: 1, orbitDays: null, extras: [], orbitLine: null };

    if (def.id === 'sun') {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      glow.scale.setScalar(radius * 9);
      anchor.add(glow);
      body.glow = glow;
    }
    if (def.visual.atmosphere) {
      const strength = def.id === 'earth' ? 1.4 : def.id === 'venus' ? 1.1 : 0.8;
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.07, 48, 24), atmosphereMaterial(def.visual.atmosphere, strength));
      tilt.add(atmo);
    }
    if (def.visual.rings) {
      const kmToUnits = radius / (def.physical.diameterKm / 2);
      const rings = new THREE.Mesh(
        ringGeometry(def.physical.ringInnerKm * kmToUnits, def.physical.ringOuterKm * kmToUnits),
        new THREE.MeshStandardMaterial({ map: this.maps.saturnRing, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }),
      );
      tilt.add(rings);
      body.rings = rings;
    }

    this.scene.add(anchor);
    this.bodies.set(def.id, body);
  }

  #buildOrbits(days) {
    this.orbitsBuiltDays = days;
    for (const body of this.bodies.values()) {
      if (body.orbitLine) { body.orbitLine.geometry.dispose(); body.orbitLine.parent.remove(body.orbitLine); }
      const { def } = body;
      let pts;
      if (def.orbit) {
        const v = new THREE.Vector3();
        pts = orbitPath(def.orbit, days).map((p) => auToScene(p, v).clone());
      } else if (def.lunarOrbit) {
        const a = def.lunarOrbit.semiMajorKm / 149597870.7;
        pts = lunarPath(def.lunarOrbit, days).map((p) => new THREE.Vector3(p.x / a, p.z / a, -p.y / a));
      } else continue;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: def.visual.color, transparent: true, opacity: 0.32, depthWrite: false }),
      );
      line.visible = this.showOrbits;
      body.orbitLine = line;
      if (def.lunarOrbit) {
        body.moonOrbitGroup = body.moonOrbitGroup || new THREE.Group();
        this.scene.add(body.moonOrbitGroup);
        body.moonOrbitGroup.add(line);
      } else this.orbitGroup.add(line);
    }
    this.#styleOrbits();
  }

  #styleOrbits() {
    for (const [id, b] of this.bodies) {
      if (!b.orbitLine) continue;
      b.orbitLine.material.opacity = id === this.selectedId ? 0.9 : 0.32;
    }
  }

  // 'bright': ambient + viewer light so every planet is easy to see (default).
  // 'realistic': sunlight only, so night sides are dark as in space.
  setLighting(mode) {
    const realistic = mode === 'realistic';
    this.ambient.intensity = realistic ? 0.035 : 0.3;
    this.headlight.intensity = realistic ? 0 : 0.75;
  }

  // Keeps the viewer light pointing from the camera toward what it looks at.
  updateHeadlight(camera, target) {
    this.headlight.position.copy(camera.position);
    this.headlight.target.position.copy(target);
  }

  setSelected(id) { this.selectedId = id; this.#styleOrbits(); }

  setShowOrbits(on) {
    this.showOrbits = on;
    for (const b of this.bodies.values()) if (b.orbitLine) b.orbitLine.visible = on;
  }

  // Sandbox overrides. sizeMul is visual only; orbitRate changes how fast the
  // body advances along its (fixed) Keplerian orbit — a kinematic override.
  setOverrides(id, { sizeMul, orbitRate }) {
    const b = this.bodies.get(id);
    if (sizeMul != null) { b.sizeMul = sizeMul; b.tilt.scale.setScalar(sizeMul); if (b.glow) b.glow.scale.setScalar(b.radius * 9 * sizeMul); }
    if (orbitRate != null) b.orbitRate = orbitRate;
  }

  resetOverrides(id, clockDays) {
    const b = this.bodies.get(id);
    this.setOverrides(id, { sizeMul: 1, orbitRate: 1 });
    b.orbitDays = clockDays;
  }

  displayRadiusOf(id) { const b = this.bodies.get(id); return b.radius * b.sizeMul; }

  // Called each frame with the global simulation day and the simulated days
  // that elapsed this frame.
  update(clockDays, dDays) {
    if (this.orbitsBuiltDays === null || Math.abs(clockDays - this.orbitsBuiltDays) > ORBIT_REBUILD_DAYS) this.#buildOrbits(clockDays);
    const earth = this.bodies.get('earth');
    for (const b of this.bodies.values()) {
      if (b.orbitDays === null) b.orbitDays = clockDays;
      else b.orbitDays += dDays * b.orbitRate;
      const { def } = b;
      if (def.orbit) auToScene(heliocentricPosition(def.orbit, b.orbitDays), b.anchor.position);
      if (this.spinEnabled && def.physical.rotationHours) {
        const turns = (clockDays * 24) / Math.abs(def.physical.rotationHours);
        b.mesh.rotation.y = (turns % 1) * Math.PI * 2;
      }
    }
    // Moon: real geocentric direction, exaggerated display distance.
    const moon = this.bodies.get('moon');
    const lo = moon.def.lunarOrbit;
    const p = geocentricMoonPosition(lo, moon.orbitDays);
    const a = lo.semiMajorKm / 149597870.7;
    const dist = Math.max(MOON_DISPLAY_DISTANCE, earth.radius * earth.sizeMul * 1.8 + moon.radius * moon.sizeMul);
    moon.anchor.position.set(p.x / a, p.z / a, -p.y / a).multiplyScalar(dist).add(earth.anchor.position);
    if (moon.moonOrbitGroup) { moon.moonOrbitGroup.position.copy(earth.anchor.position); moon.moonOrbitGroup.scale.setScalar(dist); }
  }

  // Heliocentric distance in AU (or geocentric for the Moon, in km) at the
  // body's current orbit time — physical values, independent of display scale.
  distances(id) {
    const b = this.bodies.get(id);
    const { def } = b;
    if (def.orbit) { const p = heliocentricPosition(def.orbit, b.orbitDays); return { sunAU: Math.hypot(p.x, p.y, p.z) }; }
    if (def.lunarOrbit) {
      const e = this.bodies.get('earth');
      const pe = heliocentricPosition(e.def.orbit, e.orbitDays);
      const pm = geocentricMoonPosition(def.lunarOrbit, b.orbitDays);
      const au = 149597870.7;
      return {
        earthKm: Math.hypot(pm.x, pm.y, pm.z) * au,
        sunAU: Math.hypot(pe.x + pm.x, pe.y + pm.y, pe.z + pm.z),
      };
    }
    return {};
  }
}
