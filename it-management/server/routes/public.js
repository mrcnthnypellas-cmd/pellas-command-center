// The only endpoints that work before signing in: what the sign-in page needs to look right.
// Serves just the company logo and the sign-in background — never other uploads or data.
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { setting } = require('../lib/util');
const { branding } = require('../lib/branding');

const r = express.Router();

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
