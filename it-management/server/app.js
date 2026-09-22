// Express application (exported separately from index.js so tests can mount it).
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const config = require('./config');
const db = require('./db/connection');
const { loadUser, requireAuth } = require('./lib/auth');
const { setting } = require('./lib/util');

function createApp() {
  db.open();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // Basic hardening headers (add a full CSP/HSTS at the reverse proxy for production).
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' });
    next();
  });

  // CSRF mitigation: state-changing API calls must come from our own page (custom header).
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/auth/login') return next();
    if (req.get('X-Requested-With') !== 'itms') return res.status(403).json({ error: 'Missing request header' });
    next();
  });

  app.use(loadUser);

  app.get('/api/public/company', (_req, res) => res.json({ name: setting('company_name', 'My Company') }));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/assets', require('./routes/assets'));
  app.use('/api/assignments', require('./routes/assignments'));
  app.use('/api/employees', require('./routes/employees'));
  app.use('/api/maintenance', require('./routes/maintenance'));
  app.use('/api/audits', require('./routes/audits'));
  app.use('/api/network', require('./routes/network'));
  app.use('/api/vault', require('./routes/vault'));
  app.use('/api/search', require('./routes/search'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/activity', require('./routes/activity'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/documents', require('./routes/documents'));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Uploaded photos are private: signed-in users only.
  app.use('/uploads', requireAuth, express.static(config.UPLOAD_DIR, { index: false, dotfiles: 'deny' }));
  app.use('/vendor/chart.js', express.static(path.join(config.ROOT, 'node_modules/chart.js/dist')));
  app.use(express.static(path.join(config.ROOT, 'public'), { index: 'index.html' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
    if (status >= 500) console.error(err);
    const message = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${config.MAX_UPLOAD_MB} MB)`
      : status >= 500 ? 'Unexpected server error' : err.message;
    res.status(status).json({ error: message });
  });
  return app;
}

module.exports = { createApp };
