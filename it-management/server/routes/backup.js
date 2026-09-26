// Settings → Backup & Restore. Admin-only: a backup contains every record, user and saved password.
const express = require('express');
const multer = require('multer');
const db = require('../db/connection');
const { requirePerm, destroySession } = require('../lib/auth');
const { log } = require('../lib/activity');
const { bad, setting } = require('../lib/util');
const { createBackup, openBackup, restoreBackup } = require('../lib/backup');

const r = express.Router();
const admin = requirePerm('settings.manage', 'users.manage');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const slug = (s) => String(s || 'itms').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'itms';

r.get('/status', admin, (_req, res) => {
  res.json({ last_backup_at: setting('last_backup_at'), last_restore_at: setting('last_restore_at') });
});

r.post('/download', admin, (req, res) => {
  const { password, confirm } = req.body || {};
  if (confirm !== undefined && confirm !== password) throw bad('The two passwords do not match');
  const { buffer, summary } = createBackup(password);
  db.run("INSERT INTO settings (key, value) VALUES ('last_backup_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", summary.created_at);
  log(req, 'Backup downloaded', 'settings', null, 'Backup', { assets: summary.counts.assets, files: summary.files });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${slug(summary.company_name)}-backup-${summary.created_at.slice(0, 10)}.itmsbackup"`);
  res.send(buffer);
});

r.post('/check', admin, upload.single('file'), (req, res) => {
  if (!req.file) throw bad('Choose a backup file');
  const { conn, summary } = openBackup(req.file.buffer, req.body.password);
  conn.close();
  res.json({ summary });
});

r.post('/restore', admin, upload.single('file'), (req, res) => {
  if (!req.file) throw bad('Choose a backup file');
  if (req.body.confirm !== 'RESTORE') throw bad('Type RESTORE to confirm');
  const who = `${req.user.full_name} (restore)`;
  const result = restoreBackup(req.file.buffer, req.body.password, who);
  db.run("INSERT INTO settings (key, value) VALUES ('last_restore_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", new Date().toISOString());
  destroySession(req, res); // the restored data has its own users — sign in again with those
  res.json({ ok: true, ...result });
});

module.exports = r;
