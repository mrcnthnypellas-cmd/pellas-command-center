// The only endpoints that work before signing in: what the sign-in page needs to look right.
// Serves just the company logo and the sign-in background — never other uploads or data.
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { setting } = require('../lib/util');
const { branding } = require('../lib/branding');
const { needsSetup, runSetup } = require('../lib/setup');
const { createSession } = require('../lib/auth');

const r = express.Router();

// First run: no users yet → the app shows "Let's set up your application".
r.get('/setup', (_req, res) => res.json({ needed: needsSetup() }));

// Only from the computer the system runs on (a shared office server can't be claimed from another PC).
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'browser']);
r.post('/setup', (req, res) => {
  if (!needsSetup()) return res.status(409).json({ error: 'This system is already set up. Sign in instead.' });
  if (!LOCAL.has(req.ip)) return res.status(403).json({ error: 'Finish the setup on the computer where the system is installed (open http://localhost:4000 there).' });
  const id = runSetup(req.body || {});
  createSession(res, id);
  res.json({ ok: true });
});

r.get('/company', (_req, res) => res.json({ name: setting('company_name', 'My Company') }));

r.get('/branding', (_req, res) => {
  const { presets, ...b } = branding();
  res.json({ ...b, presets });
});

function sendSettingFile(res, key) {
  const name = setting(key);
  const file = name && path.join(config.UPLOAD_DIR, path.basename(name));
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  res.type(setting(`${key}_mime`) || 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(file).pipe(res);
}

r.get('/login-background', (_req, res) => sendSettingFile(res, 'login_bg'));
r.get('/logo', (_req, res) => sendSettingFile(res, 'company_logo'));

module.exports = r;
