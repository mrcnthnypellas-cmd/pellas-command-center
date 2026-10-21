const KEY = 'george-universal-sandbox.settings.v1';

export const DEFAULTS = { labels: true, orbits: true, spin: true, reduceMotion: false, sound: true, voice: 'female', quality: 'medium' };
export const QUALITY = {
  low: { pixelRatio: 1, stars: 3000, textureSize: 256, sphereSegments: 32 },
  medium: { pixelRatio: 1.5, stars: 6000, textureSize: 512, sphereSegments: 48 },
  high: { pixelRatio: 2, stars: 9000, textureSize: 512, sphereSegments: 64 },
};

export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
  const s = { ...DEFAULTS, ...saved };
  if (!QUALITY[s.quality]) s.quality = DEFAULTS.quality;
  if (!['female', 'male', 'bading'].includes(s.voice)) s.voice = DEFAULTS.voice;
  if (!saved.quality && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) s.reduceMotion = true;
  return s;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: settings last for this session */ }
}
