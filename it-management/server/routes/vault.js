// Secure credential vault + Wi-Fi networks.
// Passwords are AES-256-GCM encrypted at rest and are ONLY returned by the explicit
// /secret endpoints, which check permissions and write an audit entry (without the secret).
const express = require('express');
const db = require('../db/connection');
const { requireAuth, requirePerm, can } = require('../lib/auth');
const { log } = require('../lib/activity');
const vault = require('../lib/vault');
const { bad, notFound, pick, required, insert, update, diff } = require('../lib/util');

const r = express.Router();
const TYPES = ['Router', 'Switch', 'Firewall', 'Access Point', 'Server', 'Wi-Fi', 'ISP Account', 'Admin Account', 'Other'];

const noStore = (res) => res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });

function grantFor(userId, credId) {
  return db.get('SELECT * FROM credential_permissions WHERE user_id = ? AND credential_id = ?', userId, credId) || {};
}

function access(user, credId) {
  const g = grantFor(user.id, credId);
  return {
    view: can(user, 'credentials.view') || !!g.can_view,
    reveal: can(user, 'credentials.reveal') || !!g.can_reveal,
    copy: can(user, 'credentials.copy') || !!g.can_copy,
    edit: can(user, 'credentials.edit'),
    delete: can(user, 'credentials.delete'),
  };
}

// Deliberately excludes password_enc.
const CRED_SELECT = `SELECT c.id, c.name, c.credential_type, c.device_id, c.asset_id, c.isp_id, c.username, c.management_url, c.notes,
    c.created_at, c.updated_at, c.last_accessed_at, cu.full_name AS created_by_name, uu.full_name AS updated_by_name, la.full_name AS last_accessed_by_name,
    nd.name AS device_name, a.asset_tag, isp.provider_name AS isp_name, (c.password_enc IS NOT NULL) AS has_password
  FROM credentials c LEFT JOIN users cu ON cu.id = c.created_by LEFT JOIN users uu ON uu.id = c.updated_by
  LEFT JOIN users la ON la.id = c.last_accessed_by LEFT JOIN network_devices nd ON nd.id = c.device_id
  LEFT JOIN assets a ON a.id = c.asset_id LEFT JOIN isps isp ON isp.id = c.isp_id`;

r.get('/credentials', requireAuth, (req, res) => {
  let rows = db.all(`${CRED_SELECT} ORDER BY c.name`);
  if (!can(req.user, 'credentials.view')) {
    const allowed = new Set(db.all('SELECT credential_id FROM credential_permissions WHERE user_id = ? AND can_view = 1', req.user.id).map((x) => x.credential_id));
    if (!allowed.size) return res.status(403).json({ error: 'Permission denied (credentials.view)' });
    rows = rows.filter((c) => allowed.has(c.id));
  }
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    rows = rows.filter((c) => [c.name, c.username, c.device_name, c.asset_tag, c.isp_name, c.credential_type].some((v) => v && v.toLowerCase().includes(q)));
  }
  if (req.query.type) rows = rows.filter((c) => c.credential_type === req.query.type);
  noStore(res).json(rows.map((c) => ({ ...c, has_password: !!c.has_password, access: access(req.user, c.id) })));
});

r.get('/credentials/types', requireAuth, (_req, res) => res.json(TYPES));

r.get('/credentials/:id', requireAuth, (req, res) => {
  const c = db.get(`${CRED_SELECT} WHERE c.id = ?`, req.params.id);
  if (!c) throw notFound('Credential');
  const acc = access(req.user, c.id);
  if (!acc.view) throw Object.assign(new Error('Permission denied'), { status: 403 });
  noStore(res).json({ ...c, has_password: !!c.has_password, access: acc });
});

// Reveal / copy. Logged as an audit event — the secret itself is never logged.
r.post('/credentials/:id/secret', requireAuth, (req, res) => {
  const row = db.get('SELECT c.*, nd.name AS device_name FROM credentials c LEFT JOIN network_devices nd ON nd.id = c.device_id WHERE c.id = ?', req.params.id);
  if (!row) throw notFound('Credential');
  const purpose = req.body.purpose === 'copy' ? 'copy' : 'reveal';
  const acc = access(req.user, row.id);
  if (!acc[purpose]) {
    log(req, `Credential ${purpose} denied`, 'credential', row.id, row.name, { device: row.device_name });
    return res.status(403).json({ error: `You do not have permission to ${purpose} this password` });
  }
  db.run("UPDATE credentials SET last_accessed_at = datetime('now'), last_accessed_by = ? WHERE id = ?", req.user.id, row.id);
  log(req, purpose === 'copy' ? 'Credential copied' : 'Credential revealed', 'credential', row.id, row.name, { device: row.device_name || null });
  noStore(res).json({ password: vault.decrypt(row.password_enc) });
});

const FIELDS = ['name', 'credential_type', 'device_id', 'asset_id', 'isp_id', 'username', 'management_url', 'notes'];
const NUM = ['device_id', 'asset_id', 'isp_id'];

r.post('/credentials', requirePerm('credentials.create'), (req, res) => {
  const d = pick(req.body, FIELDS, NUM);
  required(d, { name: 'Credential name', credential_type: 'Credential type' });
  if (!req.body.password) throw bad('Password is required');
  if (!TYPES.includes(d.credential_type)) throw bad('Invalid credential type');
  d.password_enc = vault.encrypt(req.body.password);
  d.created_by = req.user.id;
  d.updated_by = req.user.id;
  const id = insert('credentials', d);
  log(req, 'Credential created', 'credential', id, d.name, { type: d.credential_type });
  res.status(201).json({ id });
});

r.put('/credentials/:id', requirePerm('credentials.edit'), (req, res) => {
  const old = db.get('SELECT * FROM credentials WHERE id = ?', req.params.id);
  if (!old) throw notFound('Credential');
  const d = pick(req.body, FIELDS, NUM);
  if (d.credential_type && !TYPES.includes(d.credential_type)) throw bad('Invalid credential type');
  const changed = diff(old, d);
  if (req.body.password) { d.password_enc = vault.encrypt(req.body.password); changed.push('password (changed)'); }
  d.updated_by = req.user.id;
  update('credentials', old.id, d);
  log(req, 'Credential edited', 'credential', old.id, d.name || old.name, { fields: changed.join(', ') });
  res.json({ ok: true });
});

r.delete('/credentials/:id', requirePerm('credentials.delete'), (req, res) => {
  const old = db.get('SELECT * FROM credentials WHERE id = ?', req.params.id);
  if (!old) throw notFound('Credential');
  db.run('DELETE FROM credentials WHERE id = ?', old.id);
  log(req, 'Credential deleted', 'credential', old.id, old.name);
  res.json({ ok: true });
});

// Per-credential grants (for users without global credential permissions).
r.get('/credentials/:id/permissions', requirePerm('users.manage'), (req, res) => {
  res.json(db.all(`SELECT u.id AS user_id, u.full_name, u.username, r.name AS role, cp.can_view, cp.can_reveal, cp.can_copy
                     FROM users u JOIN roles r ON r.id = u.role_id
                     LEFT JOIN credential_permissions cp ON cp.user_id = u.id AND cp.credential_id = ?
                    ORDER BY u.full_name`, req.params.id));
});

r.put('/credentials/:id/permissions', requirePerm('users.manage'), (req, res) => {
  const cred = db.get('SELECT * FROM credentials WHERE id = ?', req.params.id);
  if (!cred) throw notFound('Credential');
  const grants = Array.isArray(req.body.grants) ? req.body.grants : [];
  db.tx(() => {
    db.run('DELETE FROM credential_permissions WHERE credential_id = ?', cred.id);
    for (const g of grants) {
      if (!g.can_view && !g.can_reveal && !g.can_copy) continue;
      insert('credential_permissions', { credential_id: cred.id, user_id: Number(g.user_id), can_view: 1, can_reveal: g.can_reveal ? 1 : 0, can_copy: g.can_copy ? 1 : 0 });
    }
    log(req, 'Credential permissions updated', 'credential', cred.id, cred.name, { grants: grants.length });
  });
  res.json({ ok: true });
});

// ───────── Wi-Fi ─────────
const WIFI_SELECT = `SELECT w.id, w.ssid, w.security, w.band, w.network_id, w.access_point_id, w.location_id, w.is_guest, w.is_hidden, w.notes,
    w.last_accessed_at, w.created_at, w.updated_at, (w.password_enc IS NOT NULL) AS has_password,
    n.name AS network_name, n.cidr, nd.name AS access_point_name, a.asset_tag AS access_point_tag, l.name AS location
  FROM wifi_networks w LEFT JOIN networks n ON n.id = w.network_id LEFT JOIN network_devices nd ON nd.id = w.access_point_id
  LEFT JOIN assets a ON a.id = nd.asset_id LEFT JOIN locations l ON l.id = w.location_id`;
const WIFI_FIELDS = ['ssid', 'security', 'band', 'network_id', 'access_point_id', 'location_id', 'is_guest', 'is_hidden', 'notes'];
const WIFI_NUM = ['network_id', 'access_point_id', 'location_id', 'is_guest', 'is_hidden'];

r.get('/wifi', requirePerm('wifi.view'), (req, res) => {
  noStore(res).json(db.all(`${WIFI_SELECT} ORDER BY w.ssid`).map((w) => ({
    ...w, has_password: !!w.has_password, access: { reveal: can(req.user, 'credentials.reveal'), copy: can(req.user, 'credentials.copy'), edit: can(req.user, 'wifi.manage') },
  })));
});

r.post('/wifi/:id/secret', requirePerm('wifi.view'), (req, res) => {
  const w = db.get('SELECT * FROM wifi_networks WHERE id = ?', req.params.id);
  if (!w) throw notFound('Wi-Fi network');
  const purpose = req.body.purpose === 'copy' ? 'copy' : 'reveal';
  if (!can(req.user, `credentials.${purpose}`)) {
    log(req, `Wi-Fi password ${purpose} denied`, 'wifi', w.id, w.ssid);
    return res.status(403).json({ error: `You do not have permission to ${purpose} Wi-Fi passwords` });
  }
  db.run("UPDATE wifi_networks SET last_accessed_at = datetime('now') WHERE id = ?", w.id);
  log(req, purpose === 'copy' ? 'Wi-Fi password copied' : 'Wi-Fi password revealed', 'wifi', w.id, w.ssid);
  noStore(res).json({ password: vault.decrypt(w.password_enc) });
});

r.post('/wifi', requirePerm('wifi.manage'), (req, res) => {
  const d = pick(req.body, WIFI_FIELDS, WIFI_NUM);
  required(d, { ssid: 'SSID' });
  if (req.body.password) d.password_enc = vault.encrypt(req.body.password);
  d.created_by = req.user.id;
  const id = insert('wifi_networks', d);
  log(req, 'Wi-Fi network created', 'wifi', id, d.ssid);
  res.status(201).json({ id });
});

r.put('/wifi/:id', requirePerm('wifi.manage'), (req, res) => {
  const old = db.get('SELECT * FROM wifi_networks WHERE id = ?', req.params.id);
  if (!old) throw notFound('Wi-Fi network');
  const d = pick(req.body, WIFI_FIELDS, WIFI_NUM);
  const changed = diff(old, d);
  if (req.body.password) { d.password_enc = vault.encrypt(req.body.password); changed.push('password (changed)'); }
  update('wifi_networks', old.id, d);
  log(req, 'Wi-Fi network updated', 'wifi', old.id, d.ssid || old.ssid, { fields: changed.join(', ') });
  res.json({ ok: true });
});

r.delete('/wifi/:id', requirePerm('wifi.manage'), (req, res) => {
  const old = db.get('SELECT * FROM wifi_networks WHERE id = ?', req.params.id);
  if (!old) throw notFound('Wi-Fi network');
  db.run('DELETE FROM wifi_networks WHERE id = ?', old.id);
  log(req, 'Wi-Fi network deleted', 'wifi', old.id, old.ssid);
  res.json({ ok: true });
});

module.exports = r;
