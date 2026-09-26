// Whole-system backup & restore: one password-protected file with the database, every uploaded
// file (photos, documents, logo, sign-in background) and the key that unlocks saved passwords.
//
// File layout: "ITMSBAK1" | salt(16) | iv(12) | auth tag(16) | AES-256-GCM( gzip( JSON ) )
// The encryption key is derived from the backup password with scrypt, so the file is useless
// without that password.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const config = require('../config');
const db = require('../db/connection');
const vault = require('./vault');
const { bad } = require('./util');

const MAGIC = Buffer.from('ITMSBAK1');
const FORMAT = 1;
const APP = 'pellas-it-management';
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const COUNT_TABLES = { users: "status != 'Deleted'", employees: '1', assets: '1', asset_assignments: '1', ip_addresses: '1', networks: '1', network_devices: '1', isps: '1', credentials: '1', wifi_networks: '1', phone_contacts: '1', maintenance_records: '1', documents: '1', activity_logs: '1' };

// A copy of a WAL-mode database must be marked as a normal (rollback-journal) database before it
// can be opened from memory: bytes 18–19 of the SQLite header hold the journal format (2 = WAL).
function portableDbBytes(bytes) {
  const b = Buffer.from(bytes);
  if (b.length > 100 && b.subarray(0, 16).toString('latin1') === 'SQLite format 3\0') { b[18] = 1; b[19] = 1; }
  return b;
}

const deriveKey = (password, salt) => crypto.scryptSync(String(password), salt, 32, SCRYPT);

function checkPassword(password) {
  if (!password || String(password).length < 8) throw bad('The backup password must be at least 8 characters');
}

function counts(conn) {
  const out = {};
  for (const [t, where] of Object.entries(COUNT_TABLES)) {
    try { out[t] = conn.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${where}`).get().n; } catch { out[t] = 0; }
  }
  return out;
}

const settingOf = (conn, key) => { try { return (conn.prepare('SELECT value FROM settings WHERE key = ?').get(key) || {}).value || null; } catch { return null; } };

// ───────── create ─────────
function createBackup(password) {
  checkPassword(password);
  const live = db.open();
  live.pragma('wal_checkpoint(PASSIVE)');
  const files = [];
  if (fs.existsSync(config.UPLOAD_DIR)) {
    for (const name of fs.readdirSync(config.UPLOAD_DIR)) {
      const full = path.join(config.UPLOAD_DIR, name);
      if (fs.statSync(full).isFile()) files.push({ name, data: fs.readFileSync(full).toString('base64') });
    }
  }
  const manifest = {
    format: FORMAT, app: APP, created_at: new Date().toISOString(),
    company_name: settingOf(live, 'company_name'), counts: counts(live),
    vault_key: vault.keyHex(), db: portableDbBytes(live.serialize()).toString('base64'), files,
  };
  const plain = zlib.gzipSync(Buffer.from(JSON.stringify(manifest)), { level: 6 });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    buffer: Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]),
    summary: { created_at: manifest.created_at, company_name: manifest.company_name, counts: manifest.counts, files: files.length },
  };
}

// ───────── read + check ─────────
function openBackup(buffer, password) {
  checkPassword(password);
  const buf = Buffer.from(buffer);
  if (buf.length < 60 || !buf.subarray(0, 8).equals(MAGIC)) throw bad('This is not a backup file from this system (it should end in .itmsbackup)');
  const salt = buf.subarray(8, 24); const iv = buf.subarray(24, 36); const tag = buf.subarray(36, 52);
  let plain;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(password, salt), iv);
    decipher.setAuthTag(tag);
    plain = Buffer.concat([decipher.update(buf.subarray(52)), decipher.final()]);
  } catch {
    throw bad('Wrong backup password, or the file is damaged');
  }
  let manifest;
  try { manifest = JSON.parse(zlib.gunzipSync(plain).toString('utf8')); } catch { throw bad('The backup file is damaged'); }
  if (manifest.app !== APP) throw bad('This backup is from a different application');
  if (manifest.format > FORMAT) throw bad('This backup was made by a newer version of the system. Update this PC first.');

  let conn;
  try { conn = new Database(portableDbBytes(Buffer.from(manifest.db, 'base64'))); } catch { throw bad('The database inside the backup could not be opened'); }
  try {
    const ok = conn.pragma('integrity_check', { simple: true });
    if (ok !== 'ok') throw bad('The database inside the backup is damaged');
    const admin = conn.prepare("SELECT COUNT(*) n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Admin' AND u.status = 'Active'").get().n;
    if (!admin) throw bad('The backup has no active Admin account, so nobody could sign in after restoring');
    return {
      manifest, conn,
      summary: { created_at: manifest.created_at, company_name: settingOf(conn, 'company_name'), counts: counts(conn), files: manifest.files.length },
    };
  } catch (e) { conn.close(); throw e; }
}

// ───────── restore ─────────
function safetyCopy() {
  const dir = path.join(config.DATA_DIR, 'backups', `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'itms.db'), db.open().serialize());
  fs.writeFileSync(path.join(dir, 'vault.key'), vault.keyHex(), { mode: 0o600 });
  if (fs.existsSync(config.UPLOAD_DIR)) {
    for (const name of fs.readdirSync(config.UPLOAD_DIR)) fs.copyFileSync(path.join(config.UPLOAD_DIR, name), path.join(dir, 'uploads', name));
  }
  return dir;
}

function replaceData(dbBytes, files) {
  db.close();
  for (const f of [config.DB_FILE, `${config.DB_FILE}-wal`, `${config.DB_FILE}-shm`]) fs.rmSync(f, { force: true });
  fs.writeFileSync(config.DB_FILE, dbBytes);
  fs.rmSync(config.UPLOAD_DIR, { recursive: true, force: true });
  fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(config.UPLOAD_DIR, path.basename(f.name)), f.data);
  db.open();
}

function restoreBackup(buffer, password, restoredBy) {
  const { manifest, conn, summary } = openBackup(buffer, password);
  let safety = null;
  let swapping = false;
  try {
    // Saved passwords were locked with the other PC's key: re-lock them with this PC's key.
    const fromKey = Buffer.from(manifest.vault_key, 'hex');
    const toKey = Buffer.from(vault.keyHex(), 'hex');
    const relock = conn.transaction(() => {
      for (const table of ['credentials', 'wifi_networks']) {
        for (const row of conn.prepare(`SELECT id, password_enc FROM ${table} WHERE password_enc IS NOT NULL`).all()) {
          conn.prepare(`UPDATE ${table} SET password_enc = ? WHERE id = ?`).run(vault.encryptWith(toKey, vault.decryptWith(fromKey, row.password_enc)), row.id);
        }
      }
      conn.prepare('DELETE FROM sessions').run(); // sign-ins from the other PC don't carry over
      conn.prepare(`INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_label, details) VALUES (NULL, ?, 'System restored from backup', 'settings', 'Backup', ?)`)
        .run(restoredBy, JSON.stringify({ backup_created: manifest.created_at, files: manifest.files.length }));
    });
    try { relock(); } catch { throw bad('Saved passwords in the backup could not be unlocked; nothing was changed'); }
    const newDb = conn.serialize();
    conn.close();

    safety = safetyCopy();
    swapping = true;
    replaceData(newDb, manifest.files.map((f) => ({ name: f.name, data: Buffer.from(f.data, 'base64') })));
    swapping = false;
  } catch (e) {
    try { conn.close(); } catch { /* already closed */ }
    if (swapping && safety) {
      // Something failed half-way: put the data from before the restore back.
      const up = path.join(safety, 'uploads');
      replaceData(fs.readFileSync(path.join(safety, 'itms.db')), fs.readdirSync(up).map((name) => ({ name, data: fs.readFileSync(path.join(up, name)) })));
    }
    db.open();
    throw e;
  }
  return { summary, safety_copy: path.relative(config.ROOT, safety) };
}

module.exports = { createBackup, openBackup, restoreBackup };
