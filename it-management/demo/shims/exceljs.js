// Excel files are handled by the local version only; the browser preview imports CSV.
const unavailable = () => {
  const e = new Error(__APP__
    ? 'Excel (.xlsx) files work in the desktop version. On the phone, use CSV instead (Export CSV, or save your sheet as CSV before importing).'
    : 'Excel (.xlsx) files work in the local version (npm start). In this preview, use CSV instead (Export CSV, or save your sheet as CSV before importing).');
  e.status = 400; throw e;
};
class Workbook {
  constructor() { this.xlsx = { load: unavailable, writeBuffer: unavailable }; }
  addWorksheet() { return unavailable(); }
}
module.exports = { Workbook };
