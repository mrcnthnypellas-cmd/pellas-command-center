const express = require('express');
const db = require('../db/connection');
const auth = require('../lib/auth');
const { verifyPassword, hashPassword } = require('../lib/passwords');
const { log } = require('../lib/activity');
const { bad, setting } = require('../lib/util');

const r = express.Router();

// Simple in-memory brute-force throttle (per username+ip). Replace with a shared store in production.
const attempts = new Map();

r.post('/login', (req, res) => {
  const username = String((req.body || {}).username || '').trim(); // phones often add a trailing space
  const password = String((req.body || {}).password || '');
  if (!username || !password) throw bad('Username and password are required');
  const key = `${String(username).toLowerCase()}|${req.ip}`;
  const a = attempts.get(key) || { n: 0, until: 0 };
  if (a.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  const user = db.get('SELECT * FROM users WHERE lower(username) = lower(?)', username);
  if (!user || user.status !== 'Active' || !verifyPassword(password, user.password_hash)) {
    a.n += 1;
    if (a.n >= 5) { a.until = Date.now() + 60e3; a.n = 0; }
    attempts.set(key, a);
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  attempts.delete(key);
  auth.createSession(res, user.id);
  db.run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", user.id);
  req.user = { id: user.id, full_name: user.full_name };
  log(req, 'Signed in', 'user', user.id, user.username);
  res.json({ ok: true });
});

r.post('/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

r.get('/me', auth.requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id, username: u.username, full_name: u.full_name, email: u.email, role: u.role,
    permissions: [...u.permissions],
    company: { name: setting('company_name', 'My Company'), logo: setting('company_logo') ? `/uploads/${setting('company_logo')}` : null },
  });
});

r.post('/change-password', auth.requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  const user = db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(current_password || '', user.password_hash)) throw bad('Current password is incorrect');
  if (!new_password || String(new_password).length < 8) throw bad('New password must be at least 8 characters');
  db.run("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", hashPassword(new_password), user.id);
  log(req, 'Changed own password', 'user', user.id, user.username);
  res.json({ ok: true });
});

module.exports = r;
