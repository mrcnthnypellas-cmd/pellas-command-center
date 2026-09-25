// Excel files are handled by the local version only; the browser preview imports CSV.
const unavailable = () => { const e = new Error('Excel (.xlsx) files work in the local version (npm start). In this preview, save your sheet as CSV and upload that.'); e.status = 400; throw e; };
class Workbook {
  constructor() { this.xlsx = { load: unavailable, writeBuffer: unavailable }; }
  addWorksheet() { return unavailable(); }
}
module.exports = { Workbook };
