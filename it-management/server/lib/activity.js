// Activity log + asset timeline writers. Secrets are stripped defensively.
const db = require('../db/connection');

const SECRET_KEY = /pass(word)?|secret|token|psk|key$/i;

function scrub(details) {
  if (details === null || details === undefined) return null;
  if (typeof details === 'string') return details;
  const clean = {};
  for (const [k, v] of Object.entries(details)) {
    if (SECRET_KEY.test(k)) continue;
    clean[k] = v;
  }
  return JSON.stringify(clean);
}

function log(req, action, entityType, entityId, entityLabel, details) {
  const u = req && req.user;
  db.run(
    `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, entity_label, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    u ? u.id : null, u ? u.full_name : 'System', action, entityType || null, entityId || null,
    entityLabel || null, scrub(details), req && req.ip ? req.ip : null,
  );
}

function history(req, assetId, eventType, description, eventDate) {
  db.run(
    'INSERT INTO asset_history (asset_id, event_type, description, event_date, user_id) VALUES (?, ?, ?, ?, ?)',
    assetId, eventType, description, eventDate || today(), req && req.user ? req.user.id : null,
  );
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = { log, history, today, scrub };
