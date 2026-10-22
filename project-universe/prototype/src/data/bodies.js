// Celestial body catalogue for the Stage 1 prototype.
//
// Physical values are kept separate from display (visual) values so the same
// table can later seed the Unity / double-precision simulation in Stage 2.
//
// Sources (approximate values, rounded as published):
//   - Physical data: NASA Goddard "Planetary Fact Sheet" and "Sun Fact Sheet"
//     (nssdc.gsfc.nasa.gov/planetary/factsheet/).
//   - Orbits: E. M. Standish, "Keplerian Elements for Approximate Positions of
//     the Major Planets", JPL Solar System Dynamics, Table 1 (valid 1800–2050).
//     Elements are J2000 ecliptic values plus rates per Julian century.
//     Earth uses the Earth–Moon barycentre elements.
//   - Moon: mean orbital elements (simplified, no perturbation terms).

export const EARTH_MASS_KG = 5.9722e24;
export const AU_KM = 149597870.7;

// Orbital element order: [a (AU), e, I (deg), L (deg), varpi (deg), Omega (deg)]
// Each with a matching rate per Julian century.
export const BODIES = [
  {
    id: 'sun', name: 'Sun', type: 'star', typeLabel: 'Star · G2V main sequence',
    physical: { diameterKm: 1392700, massKg: 1.9885e30, rotationHours: 609.12, axialTiltDeg: 7.25 },
    visual: { color: '#ffcf6b', texture: 'sun' },
  },
  {
    id: 'mercury', name: 'Mercury', type: 'planet', typeLabel: 'Planet · Terrestrial',
    physical: { diameterKm: 4879, massKg: 0.330e24, rotationHours: 1407.6, axialTiltDeg: 0.034 },
    orbit: {
      elements: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
      rates: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    },
    visual: { color: '#a9a29a', texture: 'mercury' },
  },
  {
    id: 'venus', name: 'Venus', type: 'planet', typeLabel: 'Planet · Terrestrial',
    physical: { diameterKm: 12104, massKg: 4.87e24, rotationHours: -5832.5, axialTiltDeg: 177.4 },
    orbit: {
      elements: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
      rates: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
    },
    visual: { color: '#e8cf98', texture: 'venus', atmosphere: '#f3d79a' },
  },
  {
    id: 'earth', name: 'Earth', type: 'planet', typeLabel: 'Planet · Terrestrial',
    physical: { diameterKm: 12756, massKg: 5.97e24, rotationHours: 23.9345, axialTiltDeg: 23.44 },
    orbit: {
      elements: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
      rates: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    },
    visual: { color: '#4f8fe0', texture: 'earth', atmosphere: '#6fb4ff' },
  },
  {
    id: 'moon', name: 'Moon', type: 'moon', typeLabel: 'Natural satellite of Earth', parent: 'earth',
    physical: { diameterKm: 3475, massKg: 0.07346e24, rotationHours: 655.7, axialTiltDeg: 6.68 },
    // Simplified geocentric mean orbit. Angles in degrees, rates in degrees per day.
    lunarOrbit: {
      semiMajorKm: 384400, e: 0.0549, inclinationDeg: 5.145,
      L0: 218.316, Ldot: 13.176396,
      varpi0: 83.353, varpiDot: 0.111404,
      Omega0: 125.044, OmegaDot: -0.0529538,
      periodDays: 27.3217,
    },
    visual: { color: '#c9c5bd', texture: 'moon' },
  },
  {
    id: 'mars', name: 'Mars', type: 'planet', typeLabel: 'Planet · Terrestrial',
    physical: { diameterKm: 6792, massKg: 0.642e24, rotationHours: 24.6229, axialTiltDeg: 25.19 },
    orbit: {
      elements: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
      rates: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    },
    visual: { color: '#d0623d', texture: 'mars', atmosphere: '#e89a74' },
  },
  {
    id: 'jupiter', name: 'Jupiter', type: 'planet', typeLabel: 'Planet · Gas giant',
    physical: { diameterKm: 142984, massKg: 1898e24, rotationHours: 9.925, axialTiltDeg: 3.13 },
    orbit: {
      elements: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
      rates: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    },
    visual: { color: '#d8b48c', texture: 'jupiter' },
  },
  {
    id: 'saturn', name: 'Saturn', type: 'planet', typeLabel: 'Planet · Gas giant',
    physical: { diameterKm: 120536, massKg: 568e24, rotationHours: 10.656, axialTiltDeg: 26.73,
      ringInnerKm: 74500, ringOuterKm: 136780 },
    orbit: {
      elements: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
      rates: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    },
    visual: { color: '#e6cf98', texture: 'saturn', rings: true },
  },
  {
    id: 'uranus', name: 'Uranus', type: 'planet', typeLabel: 'Planet · Ice giant',
    physical: { diameterKm: 51118, massKg: 86.8e24, rotationHours: -17.24, axialTiltDeg: 97.77 },
    orbit: {
      elements: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
      rates: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    },
    visual: { color: '#9fd8e0', texture: 'uranus', atmosphere: '#a9e6f0' },
  },
  {
    id: 'neptune', name: 'Neptune', type: 'planet', typeLabel: 'Planet · Ice giant',
    physical: { diameterKm: 49528, massKg: 102e24, rotationHours: 16.11, axialTiltDeg: 28.32 },
    orbit: {
      elements: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
      rates: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
    },
    visual: { color: '#4f74e8', texture: 'neptune', atmosphere: '#6f8ff5' },
  },
];

export const BODY_BY_ID = Object.fromEntries(BODIES.map((b) => [b.id, b]));

// Orbital period in days, derived from the mean-longitude rate so it stays
// consistent with the element set used for positions.
export function orbitalPeriodDays(body) {
  if (body.orbit) return (36525 * 360) / body.orbit.rates[3];
  if (body.lunarOrbit) return body.lunarOrbit.periodDays;
  return null;
}
