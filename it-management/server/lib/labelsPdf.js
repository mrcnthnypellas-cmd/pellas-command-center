// Exact-size asset label PDF: QR code (drawn as vector squares) + large asset number.
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { qrText } = require('./labels');

const MM = 72 / 25.4;

function fitFont(doc, text, font, maxPt, maxWidth) {
  let size = maxPt;
  doc.font(font);
  while (size > 4 && doc.fontSize(size).widthOfString(text) > maxWidth) size -= 0.25;
  return size;
}

function drawLabel(doc, a, x, y, size, o) {
  const { w, h } = size.label;
  const k = h / 38.1; // scale text relative to a 38.1 mm tall label
  const pad = Math.min(2.2, h * 0.07);
  if (o.cut) doc.save().lineWidth(0.3).dash(2, { space: 2 }).strokeColor('#b8bec8').roundedRect(x * MM, y * MM, w * MM, h * MM, 2 * MM).stroke().undash().restore();

  // QR: 1-module quiet zone inside the square.
  const qr = QRCode.create(qrText(a.asset_tag, o), { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const side = h - 2 * pad;
  const cell = side / (n + 2);
  doc.fillColor('#000');
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.data[r * n + c]) doc.rect((x + pad + cell * (c + 1)) * MM, (y + pad + cell * (r + 1)) * MM, cell * MM + 0.05, cell * MM + 0.05).fill();
    }
  }

  const tx = x + pad + side + pad * 0.9;
  const tw = (w - (tx - x) - pad) * MM;
  const bottom = (y + h - pad) * MM;
  let ty = (y + pad + 0.3) * MM;
  // Each line is fitted by hand (truncate with …) so heights are predictable and nothing overlaps.
  const put = (lines, font, pt, color, gap = 0.18) => {
    doc.font(font).fontSize(pt).fillColor(color);
    for (const l of lines) {
      if (ty + pt > bottom + 0.5) return;
      doc.text(l, tx * MM, ty, { lineBreak: false });
      ty += pt * 1.12;
    }
    ty += pt * gap;
  };
  const fit = (text, font, pt) => {
    doc.font(font).fontSize(pt);
    if (doc.widthOfString(text) <= tw) return text;
    let t = text;
    while (t.length > 1 && doc.widthOfString(`${t}…`) > tw) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  };
  const wrap = (text, font, pt, maxLines) => {
    doc.font(font).fontSize(pt);
    const words = text.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (doc.widthOfString(next) <= tw || !cur) cur = next;
      else { lines.push(cur); cur = word; }
    }
    if (cur) lines.push(cur);
    const out = lines.slice(0, maxLines);
    if (lines.length > maxLines) out[maxLines - 1] = fit(`${out[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, font, pt);
    return out.map((l) => fit(l, font, pt));
  };

  const small = Math.max(4.3, 5.6 * k);
  if (o.company && o.companyName) put([fit(o.companyName.toUpperCase(), 'Helvetica-Bold', small)], 'Helvetica-Bold', small, '#555', 0.05);
  const tagPt = fitFont(doc, a.asset_tag, 'Helvetica-Bold', Math.max(8, 15 * k), tw);
  put([a.asset_tag], 'Helvetica-Bold', tagPt, '#000', 0.12);
  const namePt = Math.max(4.6, 6.6 * k);
  if (o.name && a.name) put(wrap(a.name, 'Helvetica', namePt, h >= 25 ? 2 : 1), 'Helvetica', namePt, '#111', 0.1);
  if (o.serial && a.serial_number) put([fit(`S/N ${a.serial_number}`, 'Helvetica', small)], 'Helvetica', small, '#444');
  if (h >= 29 && o.company) {
    const fp = Math.max(4, 5 * k);
    if (ty + fp * 1.2 < bottom) {
      doc.font('Helvetica').fontSize(fp).fillColor('#666').text(doc.font('Helvetica').fontSize(fp).widthOfString('Property of IT · Do not remove') <= tw ? 'Property of IT · Do not remove' : fit('Property of IT', 'Helvetica', fp), tx * MM, bottom - fp * 1.1, { lineBreak: false });
    }
  }
}

function renderLabelsPdf(res, { size, assets, options }) {
  const doc = new PDFDocument({ size: [size.page.w * MM, size.page.h * MM], margin: 0, autoFirstPage: false, info: { Title: 'Asset labels' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="asset-labels-${size.key}-${new Date().toISOString().slice(0, 10)}.pdf"`);
  doc.pipe(res);
  const perPage = size.cols * size.rows;
  const slots = [...Array(options.skip).fill(null), ...assets.flatMap((a) => Array(options.copies).fill(a))];
  slots.forEach((a, i) => {
    const pos = i % perPage;
    if (pos === 0) doc.addPage();
    if (!a) return;
    const x = size.left + (pos % size.cols) * size.hPitch;
    const y = size.top + Math.floor(pos / size.cols) * size.vPitch;
    drawLabel(doc, a, x, y, size, options);
  });
  if (!slots.length) doc.addPage();
  doc.end();
}

module.exports = { renderLabelsPdf };
