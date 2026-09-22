// Minimal table → PDF renderer (pdfkit). Used by report exports.
const PDFDocument = require('pdfkit');

function renderTablePdf(res, { title, subtitle, company, columns, rows, filename }) {
  const doc = new PDFDocument({ size: 'A4', layout: columns.length > 6 ? 'landscape' : 'portrait', margin: 36, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const weights = columns.map((c) => c.width || 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / sum) * width);

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827').text(title, left, doc.y);
  doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(`${company} • ${subtitle || ''} • Generated ${new Date().toLocaleString()} • ${rows.length} record(s)`);
  doc.moveDown(0.8);

  const header = () => {
    const y = doc.y;
    doc.rect(left, y - 2, width, 16).fill('#eef2f7');
    doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8);
    let x = left;
    columns.forEach((c, i) => { doc.text(c.label, x + 3, y + 2, { width: widths[i] - 6, lineBreak: false, ellipsis: true }); x += widths[i]; });
    doc.y = y + 18;
  };
  header();
  doc.font('Helvetica').fontSize(8).fillColor('#111827');
  rows.forEach((row, ri) => {
    const cells = columns.map((c) => (row[c.key] === null || row[c.key] === undefined ? '' : String(row[c.key])));
    const h = Math.max(12, ...cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - 6 }))) + 4;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom - 14) { doc.addPage(); header(); doc.font('Helvetica').fontSize(8).fillColor('#111827'); }
    const y = doc.y;
    if (ri % 2) doc.rect(left, y - 1, width, h).fill('#f9fafb').fillColor('#111827');
    let x = left;
    cells.forEach((t, i) => { doc.text(t, x + 3, y + 1, { width: widths[i] - 6 }); x += widths[i]; });
    doc.y = y + h;
  });
  if (!rows.length) doc.fillColor('#6b7280').text('No records.');

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor('#9ca3af').text(`Page ${i + 1} of ${range.count} — Confidential: contains no passwords or protected credentials`,
      left, doc.page.height - doc.page.margins.bottom + 10, { width, align: 'center', lineBreak: false });
  }
  doc.end();
}

module.exports = { renderTablePdf };
