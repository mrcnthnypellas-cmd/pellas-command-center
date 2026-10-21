import * as THREE from 'three';
import { nebulaTexture, starSprite, mulberry32 } from './textures.js';

const STAR_COLORS = ['#9bb0ff', '#aabfff', '#cad7ff', '#f8f7ff', '#fff4ea', '#ffd2a1', '#ffcc6f'];

// Distant background: a nebula sphere plus two layers of point stars, with
// extra density along the same band the nebula brightens.
export function createStarfield(count, radius = 4000) {
  const group = new THREE.Group();

  const nebula = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.05, 48, 24),
    new THREE.MeshBasicMaterial({ map: nebulaTexture(), side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  nebula.renderOrder = -10;
  group.add(nebula);

  const rand = mulberry32(1234);
  const sprite = starSprite();
  const colors = STAR_COLORS.map((c) => new THREE.Color(c));
  for (const [share, size, opacity] of [[0.82, 1.6, 0.75], [0.18, 3.0, 1]]) {
    const n = Math.round(count * share);
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let x, y, z;
      do {
        const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        x = s * Math.cos(th); y = u; z = s * Math.sin(th);
      } while (rand() > 0.35 + 0.65 * Math.exp(-Math.pow((y * 0.8 + x * 0.5) * 3.2, 2)));
      pos.set([x * radius, y * radius, z * radius], i * 3);
      const c = colors[(rand() * colors.length) | 0];
      const b = 0.45 + rand() * 0.55;
      col.set([c.r * b, c.g * b, c.b * b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size, sizeAttenuation: false, vertexColors: true, map: sprite, transparent: true,
      opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    pts.renderOrder = -9;
    group.add(pts);
  }
  return group;
}
