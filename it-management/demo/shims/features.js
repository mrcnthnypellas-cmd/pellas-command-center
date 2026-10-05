// Phone app: Excel (.xlsx) works (real ExcelJS); there's no PDF engine, so Print is used for PDFs.
// Browser preview: files can't be downloaded there, so it keeps showing CSV on screen instead of Excel.
module.exports = { xlsx: __APP__, pdf: false };
