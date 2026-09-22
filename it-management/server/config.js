// Central configuration. Everything environment-specific lives here so a later
// deployment only needs env vars (or a different db/connection.js adapter).
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.ITMS_DATA_DIR || path.join(ROOT, 'data');

module.exports = {
  ROOT,
  DATA_DIR,
  PORT: Number(process.env.PORT || 4000),
  HOST: process.env.HOST || '127.0.0.1',
  DB_FILE: process.env.ITMS_DB_FILE || path.join(DATA_DIR, 'itms.db'),
  UPLOAD_DIR: path.join(DATA_DIR, 'uploads'),
  // Vault key: 32-byte hex in env (production) or auto-generated local key file (dev).
  VAULT_KEY: process.env.ITMS_VAULT_KEY || null,
  VAULT_KEY_FILE: path.join(DATA_DIR, 'vault.key'),
  SESSION_HOURS: Number(process.env.ITMS_SESSION_HOURS || 12),
  COOKIE_SECURE: process.env.NODE_ENV === 'production',
  MAX_UPLOAD_MB: 15,
};
