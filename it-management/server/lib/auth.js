// Session auth (httpOnly cookie → sessions table) and permission checks.
// Swap-in point for SSO later: replace login/session creation, keep req.user shape.
const crypto = require('crypto');
const db = require('../db/connection');
const config = require('../config');

const COOKIE = 'itms_session';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.SESSION_HOURS * 3600e3);
  db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expires.toISOString());
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, expires });
}

function destroySession(req, res) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.clearCookie(COOKIE);
}

function permissionsFor(userId) {
  const user = db.get('SELECT role_id FROM users WHERE id = ?', userId);
  if (!user) return new Set();
  const set = new Set(db.all('SELECT permission_key FROM role_permissions WHERE role_id = ?', user.role_id).map((r) => r.permission_key));
  for (const o of db.all('SELECT permission_key, granted FROM user_permissions WHERE user_id = ?', userId)) {
    if (o.granted) set.add(o.permission_key); else set.delete(o.permission_key);
  }
  return set;
}

// Attaches req.user when a valid session cookie is present.
function loadUser(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) {
    const row = db.get(
      `SELECT u.id, u.username, u.full_name, u.email, u.status, r.name AS role
         FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
        WHERE s.token_hash = ? AND s.expires_at > ?`, sha256(token), new Date().toISOString());
    if (row && row.status === 'Active') {
      row.permissions = permissionsFor(row.id);
      req.user = row;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}

const can = (user, perm) => !!user && user.permissions.has(perm);

// requirePerm('a', 'b') → user needs ALL listed permissions.
function requirePerm(...perms) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in' });
    const missing = perms.filter((p) => !can(req.user, p));
    if (missing.length) return res.status(403).json({ error: `Permission denied (${missing.join(', ')})` });
    next();
  };
}

module.exports = { createSession, destroySession, loadUser, requireAuth, requirePerm, can, permissionsFor, COOKIE };
