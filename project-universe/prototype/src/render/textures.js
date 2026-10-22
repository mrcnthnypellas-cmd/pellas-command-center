// Procedural textures for the backdrop and effects (nebula, stars, Sun glow).
// Planet surfaces use real maps instead: see planetMaps.js.

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

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

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
