// Small shared helpers for route handlers.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const db = require('../db/connection');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);
const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);

// Pick allowed fields from a body; trims strings, '' → null, numeric fields coerced.
function pick(body, fields, numeric = []) {
  const out = {};
  for (const f of fields) {
    if (!(f in (body || {}))) continue;
    let v = body[f];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === undefined) v = null;
    if (v !== null && numeric.includes(f)) {
      v = Number(v);
      if (Number.isNaN(v)) throw bad(`${f} must be a number`);
    }
    out[f] = v;
  }
  return out;
}

function required(obj, fields) {
  for (const [f, label] of Object.entries(fields)) {
    if (obj[f] === null || obj[f] === undefined || obj[f] === '') throw bad(`${label} is required`);
  }
}

function insert(table, data) {
  const keys = Object.keys(data);
  const r = db.run(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => data[k]));
  return Number(r.lastInsertRowid);
}

function update(table, id, data, { touch = true } = {}) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`);
  if (touch) sets.push("updated_at = datetime('now')");
  db.run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, ...keys.map((k) => data[k]), id);
}

// Returns list of human readable changed fields between old row and new data.
function diff(oldRow, data) {
  return Object.keys(data).filter((k) => String(oldRow[k] ?? '') !== String(data[k] ?? ''));
}

function setting(key, fallback = null) {
  const r = db.get('SELECT value FROM settings WHERE key = ?', key);
  return r && r.value !== null ? r.value : fallback;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const t = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((t - now) / 86400e3);
}

function warrantyStatus(endDate, soonDays = Number(setting('warranty_alert_days', 60))) {
  if (!endDate) return 'None';
  const d = daysUntil(endDate);
  if (d < 0) return 'Expired';
  if (d <= soonDays) return 'Expiring Soon';
  return 'Active';
}

// File uploads land in data/uploads with random names; originals kept in DB only.
fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
const IMAGE_OR_DOC = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel))$/;
const upload = multer({
  storage: multer.diskStorage({
    destination: config.UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase().slice(0, 10)),
  }),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(IMAGE_OR_DOC.test(file.mimetype) ? null : bad('Unsupported file type'), IMAGE_OR_DOC.test(file.mimetype)),
});

const fileUrl = (stored) => (stored ? `/uploads/${stored}` : null);

module.exports = { HttpError, bad, notFound, pick, required, insert, update, diff, setting, daysUntil, warrantyStatus, upload, fileUrl };
