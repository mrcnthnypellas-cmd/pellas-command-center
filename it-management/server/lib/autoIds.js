// Serial numbers and service tags made up by the system for assets that don't have one
// (e.g. accessories, or when the label can't be read). Turn off in Settings → Numbering & Alerts.
//   Serial:      SN-2610-7KQ2M9   (SN-<year><month>-<6 characters>)
//   Service tag: 4HX9QK2          (7 characters, like a manufacturer's service tag)
// Letters that are easy to mix up (0/O, 1/I/L) are left out.
const db = require('../db/connection');
const { setting } = require('./util');

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const random = (n) => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHABET[b % ALPHABET.length]).join('');

function unique(column, make) {
  for (let i = 0; i < 20; i++) {
    const v = make();
    if (!db.get(`SELECT 1 AS x FROM assets WHERE ${column} = ?`, v)) return v;
  }
  throw new Error(`Could not make a unique ${column}`);
}

const serialNumber = () => {
  const d = new Date();
  return unique('serial_number', () => `SN-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${random(6)}`);
};
const serviceTag = () => unique('service_tag', () => random(7));

const autoSerialOn = () => Number(setting('auto_serial', '1')) !== 0;
const autoServiceTagOn = () => Number(setting('auto_service_tag', '1')) !== 0;

// Fills the blanks on a new asset (form and spreadsheet import).
function fillAutoIds(data) {
  if (!String(data.serial_number ?? '').trim() && autoSerialOn()) data.serial_number = serialNumber();
  if (!String(data.service_tag ?? '').trim() && autoServiceTagOn()) data.service_tag = serviceTag();
  return data;
}

module.exports = { fillAutoIds, serialNumber, serviceTag, autoSerialOn, autoServiceTagOn };
