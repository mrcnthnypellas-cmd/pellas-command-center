// Approximate heliocentric positions from Keplerian elements (JPL, Standish).
// Output is ecliptic J2000 coordinates in AU: { x, y, z }.

import { AU_KM } from '../data/bodies.js';

const DEG = Math.PI / 180;

function normDeg(a) { a %= 360; return a < -180 ? a + 360 : a > 180 ? a - 360 : a; }

// Solves Kepler's equation M = E - e sin E (radians) by Newton iteration.
export function solveKepler(M, e) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

// Elements at time T (Julian centuries since J2000).
export function elementsAt(orbit, T) {
  const [a, e, I, L, varpi, Omega] = orbit.elements.map((v, i) => v + orbit.rates[i] * T);
  return { a, e, I, L, varpi, Omega };
}

// Position on the orbit for a given eccentric anomaly E (radians).
function positionFromE(el, E) {
  const { a, e, I, varpi, Omega } = el;
  const w = (varpi - Omega) * DEG;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w);
  const cO = Math.cos(Omega * DEG), sO = Math.sin(Omega * DEG);
  const cI = Math.cos(I * DEG), sI = Math.sin(I * DEG);
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: (sw * sI) * xp + (cw * sI) * yp,
  };
}

export function heliocentricPosition(orbit, days) {
  const el = elementsAt(orbit, days / 36525);
  const M = normDeg(el.L - el.varpi) * DEG;
  return positionFromE(el, solveKepler(M, el.e));
}

// Closed orbit path (AU) sampled uniformly in eccentric anomaly.
export function orbitPath(orbit, days, segments = 256) {
  const el = elementsAt(orbit, days / 36525);
  const pts = [];
  for (let i = 0; i <= segments; i++) pts.push(positionFromE(el, (i / segments) * Math.PI * 2));
  return pts;
}

// Simplified geocentric lunar position in AU (ecliptic J2000).
export function lunarElements(lo, days) {
  return {
    a: lo.semiMajorKm / AU_KM, e: lo.e, I: lo.inclinationDeg,
    L: lo.L0 + lo.Ldot * days, varpi: lo.varpi0 + lo.varpiDot * days, Omega: lo.Omega0 + lo.OmegaDot * days,
  };
}

export function geocentricMoonPosition(lo, days) {
  const el = lunarElements(lo, days);
  const M = normDeg(el.L - el.varpi) * DEG;
  return positionFromE(el, solveKepler(M, el.e));
}

export function lunarPath(lo, days, segments = 128) {
  const el = lunarElements(lo, days);
  const pts = [];
  for (let i = 0; i <= segments; i++) pts.push(positionFromE(el, (i / segments) * Math.PI * 2));
  return pts;
}
