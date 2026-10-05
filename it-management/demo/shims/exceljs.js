// The phone app and browser preview use the real ExcelJS (its browser build), so Excel files with
// drop-down lists can be exported and imported on the phone too. ExcelJS and our spreadsheet code
// expect Node's Buffer, so a browser Buffer is provided first.
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = require('buffer').Buffer;
module.exports = require('exceljs/dist/exceljs.min.js');
