// Reading and writing tables as CSV or Excel (.xlsx).
const ExcelJS = require('exceljs');
const { bad } = require('./util');

// ───────── CSV ─────────
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ',';
}

function parseCsv(input) {
  const text = String(input).replace(/^﻿/, '');
  const delim = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // stop spreadsheet apps from running cell text as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// BOM so Excel opens UTF-8 (₱, ñ) correctly.
const toCsv = (headers, rows) => `﻿${[headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

// ───────── Excel ─────────
function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return cellValue(v.result);
    if ('text' in v) return String(v.text);
    if (v.error) return '';
    return '';
  }
  return v;
}

async function readXlsx(buffer, preferredSheet) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    if (e.status) throw e;
    throw bad('Could not read this Excel file. Save it as .xlsx (Excel Workbook) or CSV and try again.');
  }
  const ws = wb.getWorksheet(preferredSheet) || wb.worksheets.find((w) => w.state !== 'hidden' && w.actualRowCount > 0) || wb.worksheets[0];
  if (!ws) throw bad('The Excel file has no worksheets');
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const out = [];
    for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c++) out.push(cellValue(row.getCell(c).value));
    rows[n - 1] = out;
  });
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

// → { rows: [[...], ...] } with raw cell values (strings, numbers, Dates)
async function readTable(file, preferredSheet) {
  const name = String(file.originalname || '').toLowerCase();
  if (name.endsWith('.xlsx')) return readXlsx(file.buffer, preferredSheet);
  if (name.endsWith('.xls')) throw bad('Old .xls files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV.');
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsv(new TextDecoder('utf-8').decode(file.buffer));
  throw bad('Upload an Excel (.xlsx) or CSV file');
}

// sheets: [{ name, headers, rows, widths?, required?: Set<header>, lists?: { [header]: 'Lists!$A$2:$A$99' }, notes? }]
async function writeXlsx(sheets, { title } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IT Management System';
  wb.created = new Date();
  if (title) wb.title = title;
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name, { views: sh.headers ? [{ state: 'frozen', ySplit: 1 }] : [], state: sh.hidden ? 'hidden' : 'visible' });
    if (sh.lines) {
      sh.lines.forEach((l, i) => {
        const row = ws.addRow(Array.isArray(l) ? l : [l]);
        if (i === 0) row.font = { bold: true, size: 14 };
        if (l && l.bold) row.font = { bold: true };
      });
      ws.getColumn(1).width = sh.widths ? sh.widths[0] : 110;
      if (sh.widths) sh.widths.slice(1).forEach((w, i) => { ws.getColumn(i + 2).width = w; });
      continue;
    }
    ws.addRow(sh.headers);
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.alignment = { vertical: 'middle' };
    head.height = 20;
    sh.headers.forEach((h, i) => {
      head.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sh.required && sh.required.has(h) ? 'FF1D4ED8' : sh.readOnly && sh.readOnly.has(h) ? 'FF6B7280' : 'FF334155' } };
      ws.getColumn(i + 1).width = (sh.widths && sh.widths[i]) || Math.min(Math.max(String(h).length + 4, 12), 40);
    });
    for (const r of sh.rows || []) ws.addRow(r);
    (sh.dateCols || []).forEach((i) => { ws.getColumn(i + 1).numFmt = 'yyyy-mm-dd'; });
    (sh.moneyCols || []).forEach((i) => { ws.getColumn(i + 1).numFmt = '#,##0.00'; });
    const last = Math.max((sh.rows || []).length + 1, sh.validateRows || 0);
    for (const [header, formula] of Object.entries(sh.lists || {})) {
      const col = sh.headers.indexOf(header);
      if (col < 0) continue;
      const letter = ws.getColumn(col + 1).letter;
      // The arrow appears when a cell is selected; the input message says so (the header filter only lists values already typed).
      ws.dataValidations.add(`${letter}2:${letter}${last}`, { type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: false,
        showInputMessage: true, promptTitle: header, prompt: 'Pick from the list: click the arrow on the right of this cell.' });
    }
    if (sh.headers.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sh.headers.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { parseCsv, toCsv, readTable, writeXlsx };
