// Settings → License: see the license status and enter a new or renewed key.
const express = require('express');
const { requireAuth, requirePerm } = require('../lib/auth');
const { log } = require('../lib/activity');
const license = require('../lib/license');

const r = express.Router();

r.get('/', requireAuth, (_req, res) => res.json(license.status()));

r.post('/', requirePerm('settings.manage'), (req, res) => {
  const s = license.activate((req.body || {}).key);
  log(req, 'License key entered', 'settings', null, s.licensee, { expires: s.expires, key_id: s.id });
  res.json(s);
});

module.exports = r;
