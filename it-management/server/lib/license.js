// License keys: "ITMS1.<payload>.<signature>", both parts base64url. The payload is JSON:
//   { c: licensed company, e: expiry date (YYYY-MM-DD, last valid day) or "never" (lifetime), i: issue date, n: key id }
// Keys are signed by the software owner (see tools/license), so the dates can't be edited.
// Works offline. A clock set far back is noticed through the last date the system saw.
const db = require('../db/connection');
const signer = require('./licenseKey');

const PREFIX = 'ITMS1';
const WARN_DAYS = 30;
const LIFETIME = 'never';

const b64urlToBytes = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
};
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayNumber = (ymd) => Math.floor(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86400000);

// → { ok: true, payload } or { ok: false, reason }
function decodeKey(raw) {
  const key = String(raw || '').replace(/\s+/g, '');
  if (!key) return { ok: false, reason: 'missing' };
  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: 'invalid' };
  let payload;
  try {
    const sig = b64urlToBytes(parts[2]);
    if (sig.length !== 64 || !signer.verify(new TextEncoder().encode(`${PREFIX}.${parts[1]}`), sig)) return { ok: false, reason: 'invalid' };
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  } catch { return { ok: false, reason: 'invalid' }; }
  if (!payload || typeof payload.c !== 'string' || !(payload.e === LIFETIME || /^\d{4}-\d{2}-\d{2}$/.test(payload.e || ''))) return { ok: false, reason: 'invalid' };
  return { ok: true, key, payload };
}

const setting = (k) => (db.get('SELECT value FROM settings WHERE key = ?', k) || {}).value || null;
const saveSetting = (k, v) => db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v);

// Status of a key (the stored one by default). state: valid | expired | missing | invalid | clock
function status(raw = setting('license_key'), { today = localDate(), remember = true } = {}) {
  const d = decodeKey(raw);
  if (!d.ok) return { state: d.reason, valid: false };
  const { c: licensee, e: expires, i: issued, n: id } = d.payload;
  // Lifetime keys never expire, so the computer's date doesn't matter for them.
  if (expires === LIFETIME) return { licensee, expires, lifetime: true, issued: issued || null, id: id || null, days_left: null, state: 'valid', valid: true, warn: false };
  // Remember the latest date seen, so turning the computer's clock back doesn't revive an expired key.
  const lastSeen = setting('license_last_seen');
  if (lastSeen && dayNumber(today) < dayNumber(lastSeen) - 1) {
    return { state: 'clock', valid: false, licensee, expires, last_seen: lastSeen };
  }
  if (remember && (!lastSeen || today > lastSeen)) { try { saveSetting('license_last_seen', today); } catch { /* read-only moment */ } }
  const daysLeft = dayNumber(expires) - dayNumber(today);
  const base = { licensee, expires, issued: issued || null, id: id || null, days_left: daysLeft };
  if (daysLeft < 0) return { ...base, state: 'expired', valid: false };
  return { ...base, state: 'valid', valid: true, warn: daysLeft <= WARN_DAYS };
}

// Checks a new key and stores it. Throws a readable error when it can't be used.
function activate(raw) {
  const s = status(raw, { remember: false });
  if (s.state === 'missing') throw Object.assign(new Error('Enter the license key'), { status: 400 });
  if (s.state === 'invalid') throw Object.assign(new Error('This license key is not valid. Check that it was copied completely.'), { status: 400 });
  if (s.state === 'expired') throw Object.assign(new Error(`This license key expired on ${s.expires}. Ask for a renewed key.`), { status: 400 });
  if (s.state === 'clock') throw Object.assign(new Error("This computer's date looks wrong. Set the correct date and try again."), { status: 400 });
  saveSetting('license_key', decodeKey(raw).key);
  return status();
}

module.exports = { decodeKey, status, activate, localDate, PREFIX, LIFETIME };
