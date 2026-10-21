// Procedural planet textures, drawn on canvases at start-up. Everything here is
// original and generated in code: these are stylised surfaces, not real maps.

import * as THREE from 'three';

// ---- Seeded 3D value noise -------------------------------------------------
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rand(); }
  for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const s = (t) => t * t * (3 - 2 * t);
  const noise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = s(x - xi), v = s(y - yi), w = s(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
      w,
    );
  };
  const fbm = (x, y, z, oct = 5) => {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * noise(x * f, y * f, z * f); norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  };
  return { noise, fbm };
}

// Iterates an equirectangular canvas, giving each pixel its latitude and
// unit-sphere direction so 3D noise wraps seamlessly.
function paint(w, h, fn) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const out = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * Math.PI * 2;
      out[3] = 255;
      fn(cl * Math.cos(lon), sl, cl * Math.sin(lon), lat, out);
      const i = (y * w + x) * 4;
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
function mixRGB(out, c1, c2, t) { out[0] = mix(c1[0], c2[0], t); out[1] = mix(c1[1], c2[1], t); out[2] = mix(c1[2], c2[2], t); }
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

function banded(seed, stops, { turb = 0.08, freq = 6, spot = null } = {}) {
  const { fbm } = makeNoise(seed);
  const cols = stops.map(hex);
  return (x, y, z, lat, out) => {
    const warp = (fbm(x * 3, y * 3, z * 3, 4) - 0.5) * turb * 4;
    let t = Math.sin((y + warp) * freq * Math.PI) * 0.5 + 0.5;
    t = t * 0.7 + fbm(x * 2, y * 18, z * 2, 3) * 0.3;
    const idx = t * (cols.length - 1);
    const i0 = Math.min(cols.length - 2, Math.floor(idx));
    mixRGB(out, cols[i0], cols[i0 + 1], idx - i0);
    if (spot) {
      const dLat = (lat - spot.lat) / spot.h, lon = Math.atan2(z, x);
      let dLon = lon - spot.lon; dLon = Math.atan2(Math.sin(dLon), Math.cos(dLon)) / spot.w;
      const r = dLat * dLat + dLon * dLon;
      if (r < 1) mixRGB(out, out, hex(spot.color), (1 - r) * spot.strength);
    }
  };
}

function rocky(seed, dark, light, { craters = 0.0, freq = 3, maria = null, caps = null } = {}) {
  const { fbm, noise } = makeNoise(seed);
  const cd = hex(dark), cl = hex(light);
  return (x, y, z, lat, out) => {
    let t = fbm(x * freq, y * freq, z * freq, 6);
    if (maria) t = mix(t, t * 0.55, smooth(0.52, 0.6, fbm(x * 1.2 + 9, y * 1.2, z * 1.2, 4)) * maria);
    if (craters) {
      const c = noise(x * 22, y * 22, z * 22);
      t += (c > 0.82 ? -0.18 : c > 0.76 ? 0.08 : 0) * craters;
    }
    mixRGB(out, cd, cl, clamp01(t * 1.25 - 0.1));
    if (caps && Math.abs(lat) > caps.lat - fbm(x * 6, y * 6, z * 6, 3) * 0.12) mixRGB(out, out, hex(caps.color), 0.9);
  };
}

const SURFACES = {
  sun: () => {
    const { fbm } = makeNoise(11);
    return (x, y, z, lat, out) => {
      const t = fbm(x * 9, y * 9, z * 9, 5);
      mixRGB(out, [240, 110, 20], [255, 214, 120], clamp01(t * 1.7 - 0.3));
    };
  },
  mercury: () => rocky(21, '#4a4540', '#b8b0a6', { craters: 1, freq: 4 }),
  venus: () => banded(31, ['#c99a5a', '#e6c88f', '#f2dcae', '#d9b277'], { turb: 0.25, freq: 2.5 }),
  earth: () => {
    const { fbm } = makeNoise(41);
    const deep = hex('#0b2d5c'), shallow = hex('#1f6fae'), green = hex('#3f7a3a'),
      dry = hex('#a58a5a'), ice = hex('#eef4f8');
    return (x, y, z, lat, out) => {
      const h = fbm(x * 2.2, y * 2.2, z * 2.2, 6);
      if (h < 0.5) mixRGB(out, deep, shallow, smooth(0.36, 0.5, h));
      else {
        const arid = smooth(0.0, 0.45, 1 - Math.abs(Math.abs(lat) - 0.4) * 3) * fbm(x * 5, y * 5, z * 5, 3);
        mixRGB(out, green, dry, clamp01(arid * 1.4 + (h - 0.5) * 2));
      }
      if (Math.abs(lat) > 1.2 - fbm(x * 7, y * 7, z * 7, 3) * 0.15) mixRGB(out, out, ice, 0.95);
    };
  },
  moon: () => rocky(51, '#55524d', '#c9c5bd', { craters: 1.2, freq: 3.5, maria: 1 }),
  mars: () => rocky(61, '#6e2b17', '#d9784a', { craters: 0.4, freq: 2.6, caps: { lat: 1.32, color: '#f1e6dc' } }),
  jupiter: () => banded(71, ['#8a5a3c', '#d9b48c', '#f1e2c8', '#c08a5c', '#efe0c5'],
    { turb: 0.14, freq: 7, spot: { lat: -0.38, lon: 1.2, h: 0.09, w: 0.2, color: '#b5502e', strength: 0.85 } }),
  saturn: () => banded(81, ['#b8975c', '#e3cd98', '#f2e4bf', '#cdb07a'], { turb: 0.06, freq: 6 }),
  uranus: () => banded(91, ['#86c6d2', '#a7dde4', '#b8e7ec'], { turb: 0.03, freq: 3 }),
  neptune: () => banded(101, ['#2f4fb8', '#4a6fe0', '#6b8cf0', '#3b5cc8'],
    { turb: 0.08, freq: 4, spot: { lat: -0.35, lon: 2.4, h: 0.07, w: 0.14, color: '#1b2a6e', strength: 0.8 } }),
};

export function planetTexture(kind, size) {
  const canvas = paint(size * 2, size, SURFACES[kind]());
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function cloudTexture(size) {
  const { fbm } = makeNoise(43);
  const canvas = paint(size * 2, size, (x, y, z, lat, out) => {
    const t = fbm(x * 3 + fbm(x * 6, y * 6, z * 6, 2), y * 6, z * 3, 5);
    out[0] = out[1] = out[2] = 255;
    out[3] = smooth(0.5, 0.75, t) * 230 * (1 - smooth(1.3, 1.5, Math.abs(lat)) * 0.4);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Saturn's ring system as a radial strip (u = inner→outer radius).
export function ringTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 4;
  const ctx = canvas.getContext('2d');
  const { noise } = makeNoise(83);
  for (let x = 0; x < 512; x++) {
    const u = x / 511;
    let a = 0.25 + noise(u * 60, 0.5, 0.5) * 0.55;
    if (u < 0.22) a *= 0.35;                 // faint C ring
    if (u > 0.69 && u < 0.74) a *= 0.08;     // Cassini division
    if (u > 0.93 && u < 0.945) a *= 0.3;     // Encke gap
    const b = 170 + noise(u * 25, 1.5, 0.5) * 70;
    ctx.fillStyle = `rgba(${b | 0},${(b * 0.9) | 0},${(b * 0.74) | 0},${a.toFixed(3)})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function glowTexture(inner = 'rgba(255,220,150,1)', outer = 'rgba(255,140,40,0)') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(0.18, 'rgba(255,200,120,0.55)');
  g.addColorStop(0.45, 'rgba(255,150,60,0.12)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function nebulaTexture(w = 512, h = 256) {
  const { fbm } = makeNoise(7);
  const violet = [64, 36, 120], teal = [20, 70, 110], base = [3, 5, 14];
  const canvas = paint(w, h, (x, y, z, lat, out) => {
    // Brighter along a tilted band, loosely like a galactic plane.
    const band = Math.exp(-Math.pow((y * 0.8 + x * 0.5) * 3.2, 2));
    const n = fbm(x * 2.5 + 3, y * 2.5, z * 2.5, 6);
    const m = fbm(x * 4, y * 4 + 5, z * 4, 4);
    const t = clamp01((n - 0.42) * 2.4) * (0.35 + band * 0.9);
    out[0] = base[0] + (violet[0] * (1 - m) + teal[0] * m) * t;
    out[1] = base[1] + (violet[1] * (1 - m) + teal[1] * m) * t;
    out[2] = base[2] + (violet[2] * (1 - m) + teal[2] * m) * t;
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function starSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export { mulberry32 };
