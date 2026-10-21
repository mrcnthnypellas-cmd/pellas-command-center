import { EARTH_MASS_KG, AU_KM } from '../data/bodies.js';

const nf = (d) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmt = (v, d = 0) => nf(d).format(v);

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export function sci(v, d = 2) {
  const exp = Math.floor(Math.log10(Math.abs(v)));
  const mant = v / Math.pow(10, exp);
  return `${mant.toFixed(d)} × 10${String(exp).split('').map((c) => SUP[c]).join('')}`;
}

export function massText(kg) {
  const em = kg / EARTH_MASS_KG;
  const rel = em >= 1000 ? `${fmt(em, 0)} M⊕` : em >= 10 ? `${fmt(em, 1)} M⊕` : em >= 0.1 ? `${fmt(em, 3)} M⊕` : `${fmt(em, 4)} M⊕`;
  return { main: `${sci(kg)} kg`, sub: rel };
}

export function durationDays(days) {
  const a = Math.abs(days);
  if (a >= 3652.5) return `${fmt(a / 365.25, 1)} yr`;
  if (a >= 365.25) return `${fmt(a / 365.25, 2)} yr`;
  if (a >= 2) return `${fmt(a, a < 100 ? 2 : 1)} d`;
  return `${fmt(a * 24, 2)} h`;
}

export function auText(au) { return `${fmt(au, au < 10 ? 3 : 2)} AU`; }
export function auToMillionKm(au) { return `${fmt((au * AU_KM) / 1e6, 1)} million km`; }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateText(d) {
  const y = d.getUTCFullYear();
  if (!Number.isFinite(y)) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return { date: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${y}`, time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`, year: y };
}

export function multText(rate) { return `×${fmt(rate)}`; }
