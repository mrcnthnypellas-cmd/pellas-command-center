// System users, roles and per-user permission overrides.
const express = require('express');
const db = require('../db/connection');
const { requirePerm, permissionsFor } = require('../lib/auth');
const { log } = require('../lib/activity');
const { hashPassword } = require('../lib/passwords');
const { bad, notFound, pick, required, insert, update } = require('../lib/util');

const r = express.Router();
const manage = requirePerm('users.manage');

r.get('/', manage, (_req, res) => {
  res.json(db.all(`SELECT u.id, u.username, u.full_name, u.email, u.status, u.last_login_at, u.created_at, u.role_id, r.name AS role,
                     (SELECT COUNT(*) FROM user_permissions up WHERE up.user_id = u.id) AS overrides
                     FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.full_name`));
});

r.get('/roles', manage, (_req, res) => {
  const perms = db.all('SELECT * FROM permissions ORDER BY module, key');
  const roles = db.all('SELECT * FROM roles ORDER BY id').map((ro) => ({
    ...ro, permissions: db.all('SELECT permission_key FROM role_permissions WHERE role_id = ?', ro.id).map((x) => x.permission_key),
  }));
  res.json({ roles, permissions: perms });
});

r.put('/roles/:id', manage, (req, res) => {
  const role = db.get('SELECT * FROM roles WHERE id = ?', req.params.id);
  if (!role) throw notFound('Role');
  if (role.name === 'Admin') throw bad('The Admin role always has full access');
  const keys = Array.isArray(req.body.permissions) ? req.body.permissions : [];
  const valid = new Set(db.all('SELECT key FROM permissions').map((p) => p.key));
  db.tx(() => {
    db.run('DELETE FROM role_permissions WHERE role_id = ?', role.id);
    for (const k of keys) if (valid.has(k)) insert('role_permissions', { role_id: role.id, permission_key: k });
  });
  log(req, 'Role permissions updated', 'role', role.id, role.name, { count: keys.length });
  res.json({ ok: true });
});

r.get('/:id/permissions', manage, (req, res) => {
  const u = db.get('SELECT u.*, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', req.params.id);
  if (!u) throw notFound('User');
  res.json({
    role: u.role,
    role_permissions: db.all('SELECT permission_key FROM role_permissions WHERE role_id = ?', u.role_id).map((x) => x.permission_key),
    overrides: db.all('SELECT permission_key, granted FROM user_permissions WHERE user_id = ?', u.id),
    effective: [...permissionsFor(u.id)],
  });
});

// Body: { overrides: [{ permission_key, granted: 0|1 }] } — replaces all overrides.
r.put('/:id/permissions', manage, (req, res) => {
  const u = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) throw notFound('User');
  const valid = new Set(db.all('SELECT key FROM permissions').map((p) => p.key));
  const list = Array.isArray(req.body.overrides) ? req.body.overrides : [];
  db.tx(() => {
    db.run('DELETE FROM user_permissions WHERE user_id = ?', u.id);
    for (const o of list) if (valid.has(o.permission_key)) insert('user_permissions', { user_id: u.id, permission_key: o.permission_key, granted: o.granted ? 1 : 0 });
  });
  log(req, 'User permissions updated', 'user', u.id, u.username, { overrides: list.length });
  res.json({ ok: true });
});

function checkLastAdmin(userId, nextRoleId, nextStatus) {
  const admin = db.get("SELECT id FROM roles WHERE name = 'Admin'");
  const current = db.get('SELECT role_id, status FROM users WHERE id = ?', userId);
  if (current.role_id !== admin.id) return;
  if ((nextRoleId && nextRoleId !== admin.id) || (nextStatus && nextStatus !== 'Active')) {
    const others = db.get("SELECT COUNT(*) n FROM users WHERE role_id = ? AND status = 'Active' AND id != ?", admin.id, userId).n;
    if (!others) throw bad('At least one active Admin is required');
  }
}

r.post('/', manage, (req, res) => {
  const d = pick(req.body, ['username', 'full_name', 'email', 'role_id', 'status'], ['role_id']);
  required(d, { username: 'Username', full_name: 'Full name', role_id: 'Role' });
  if (!req.body.password || String(req.body.password).length < 8) throw bad('Password must be at least 8 characters');
  if (db.get('SELECT 1 FROM users WHERE lower(username) = lower(?)', d.username)) throw bad('Username already exists');
  d.password_hash = hashPassword(req.body.password);
  d.status = d.status || 'Active';
  const id = insert('users', d);
  log(req, 'User created', 'user', id, d.username);
  res.status(201).json({ id });
});

r.put('/:id', manage, (req, res) => {
  const old = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!old) throw notFound('User');
  const d = pick(req.body, ['full_name', 'email', 'role_id', 'status'], ['role_id']);
  checkLastAdmin(old.id, d.role_id, d.status);
  if (req.body.password) {
    if (String(req.body.password).length < 8) throw bad('Password must be at least 8 characters');
    d.password_hash = hashPassword(req.body.password);
  }
  update('users', old.id, d);
  if (d.status && d.status !== 'Active') db.run('DELETE FROM sessions WHERE user_id = ?', old.id);
  log(req, 'User updated', 'user', old.id, old.username, { fields: Object.keys(d).map((k) => (k === 'password_hash' ? 'password reset' : k)).join(', ') });
  res.json({ ok: true });
});

r.delete('/:id', manage, (req, res) => {
  const u = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) throw notFound('User');
  if (u.id === req.user.id) throw bad('You cannot delete your own account');
  checkLastAdmin(u.id, -1, 'Disabled');
  // Keep history intact: disable instead of hard delete if the user authored records.
  db.run("UPDATE users SET status = 'Disabled', updated_at = datetime('now') WHERE id = ?", u.id);
  db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
  log(req, 'User disabled', 'user', u.id, u.username);
  res.json({ ok: true });
});

module.exports = r;
