// Display scale. Real distances and diameters cannot share one linear scale on
// a phone screen, so the prototype draws a deliberately compressed view.
// Physical values (used in the info panel) are never altered by this mapping.

const DIST_K = 40;      // scene units at 1 AU
const DIST_EXP = 0.5;   // distance compression exponent
const RADIUS_K = 1.6;   // scene units for Earth's radius
const RADIUS_EXP = 0.42;
const EARTH_RADIUS_KM = 6371;

export const MOON_DISPLAY_DISTANCE = 4.6; // scene units from Earth's centre (exaggerated)

// Maps a heliocentric AU vector to scene coordinates (Y up, ecliptic = XZ plane).
export function auToScene(p, out) {
  const r = Math.hypot(p.x, p.y, p.z);
  const k = r > 0 ? (DIST_K * Math.pow(r, DIST_EXP)) / r : 0;
  out.set(p.x * k, p.z * k, -p.y * k);
  return out;
}

export function displayRadius(diameterKm) {
  return RADIUS_K * Math.pow(diameterKm / 2 / EARTH_RADIUS_KM, RADIUS_EXP);
}
