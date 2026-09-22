// Asset label (sticker) formats, in millimetres. Sheet formats follow common A4 label stock
// so labels line up with pre-cut stickers; roll formats print one label per page.
const SIZES = [
  { key: 'a4-21', name: 'A4 sheet · 21 labels · 63.5 × 38.1 mm', hint: 'Avery L7160 / J8160 or compatible', page: { w: 210, h: 297 }, label: { w: 63.5, h: 38.1 }, cols: 3, rows: 7, left: 7.21, top: 15.15, hPitch: 66.04, vPitch: 38.1 },
  { key: 'a4-14', name: 'A4 sheet · 14 labels · 99.1 × 38.1 mm', hint: 'Avery L7163 / J8163 or compatible', page: { w: 210, h: 297 }, label: { w: 99.1, h: 38.1 }, cols: 2, rows: 7, left: 4.65, top: 15.15, hPitch: 101.6, vPitch: 38.1 },
  { key: 'a4-65', name: 'A4 sheet · 65 mini labels · 38.1 × 21.2 mm', hint: 'Avery L7651 — for mice, keyboards, chargers', page: { w: 210, h: 297 }, label: { w: 38.1, h: 21.2 }, cols: 5, rows: 13, left: 4.75, top: 10.7, hPitch: 40.64, vPitch: 21.2 },
  { key: 'roll-50x25', name: 'Roll sticker · 50 × 25 mm', hint: 'Thermal label printers (Zebra, Xprinter, TSC)', page: { w: 50, h: 25 }, label: { w: 50, h: 25 }, cols: 1, rows: 1, left: 0, top: 0, hPitch: 50, vPitch: 25 },
  { key: 'roll-62x29', name: 'Roll sticker · 62 × 29 mm', hint: 'Brother QL (DK-11209)', page: { w: 62, h: 29 }, label: { w: 62, h: 29 }, cols: 1, rows: 1, left: 0, top: 0, hPitch: 62, vPitch: 29 },
];

const sizeByKey = (key) => SIZES.find((s) => s.key === key) || SIZES[0];
const BASE_RE = /^https?:\/\/[^\s"<>#?]+$/;

// What the QR encodes: a link to the asset profile (sign-in required) or just the asset number.
// Never credentials or any other protected data.
function qrText(tag, { mode, base }) {
  if (mode === 'tag') return tag;
  return `${String(base).replace(/\/+$/, '')}/#/assets/${encodeURIComponent(tag)}`;
}

module.exports = { SIZES, sizeByKey, qrText, BASE_RE };
