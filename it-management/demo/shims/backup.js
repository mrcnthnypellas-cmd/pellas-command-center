// Browser version of server/lib/backup.js: the same password-protected .itmsbackup file, so a
// backup made on the phone restores on the PC and the other way round.
// File layout: "ITMSBAK1" | salt(16) | iv(12) | auth tag(16) | AES-256-GCM( gzip( JSON ) )
const { gzipSync, gunzipSync, strToU8, strFromU8 } = require('fflate');
const { scrypt } = require('@noble/hashes/scrypt.js');
const { gcm } = require('@noble/ciphers/aes.js');
const { hexToBytes } = require('@noble/ciphers/utils.js');
const db = require('./connection');
const vault = require('./vault');

const MAGIC = 'ITMSBAK1';
const FORMAT = 1;
const APP = 'pellas-it-management';
const COUNT_TABLES = { users: "status != 'Deleted'", employees: '1', assets: '1', asset_assignments: '1', ip_addresses: '1', networks: '1', network_devices: '1', isps: '1', credentials: '1', wifi_networks: '1', phone_contacts: '1', maintenance_records: '1', documents: '1', activity_logs: '1' };
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', svg: 'image/svg+xml' };

const bad = (m) => { const e = new Error(m); e.status = 400; return e; };
const deriveKey = (password, salt) => scrypt(String(password), salt, { N: 2 ** 15, r: 8, p: 1, dkLen: 32 });
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function checkPassword(password) {
  if (!password || String(password).length < 8) throw bad('The backup password must be at least 8 characters');
}

// Tiny query helpers over a separate sql.js database (the one inside a backup).
const q = (conn, sql, ...p) => { const st = conn.prepare(sql); try { st.bind(p); const out = []; while (st.step()) out.push(st.getAsObject()); return out; } finally { st.free(); } };
function counts(conn) {
  const out = {};
  for (const [t, where] of Object.entries(COUNT_TABLES)) { try { out[t] = q(conn, `SELECT COUNT(*) n FROM ${t} WHERE ${where}`)[0].n; } catch { out[t] = 0; } }
  return out;
}
const settingOf = (conn, key) => { try { return (q(conn, 'SELECT value FROM settings WHERE key = ?', key)[0] || {}).value || null; } catch { return null; } };

function createBackup(password) {
  checkPassword(password);
  const SQL = db.engine();
  // Uploaded files live in a helper table in the browser; the backup keeps them as separate files like the PC does.
  const files = db.all('SELECT name, data FROM _demo_files').map((f) => ({ name: f.name, data: b64(f.data) }));
  const copy = new SQL.Database(db.exportBytes());
  copy.exec('DROP TABLE IF EXISTS _demo_files');
  const manifest = {
    format: FORMAT, app: APP, created_at: new Date().toISOString(),
    company_name: settingOf(copy, 'company_name'), counts: counts(copy),
    vault_key: vault.keyHex(), db: b64(copy.export()), files,
  };
  copy.close();
  const plain = gzipSync(strToU8(JSON.stringify(manifest)), { level: 6 });
  const salt = random(16); const iv = random(12);
  const sealed = gcm(deriveKey(password, salt), iv).encrypt(plain);
  const out = new Uint8Array(8 + 16 + 12 + 16 + sealed.length - 16);
  out.set(strToU8(MAGIC), 0); out.set(salt, 8); out.set(iv, 24); out.set(sealed.subarray(sealed.length - 16), 36); out.set(sealed.subarray(0, sealed.length - 16), 52);
  return { buffer: out, summary: { created_at: manifest.created_at, company_name: manifest.company_name, counts: manifest.counts, files: files.length } };
}

function openBackup(buffer, password) {
  checkPassword(password);
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 60 || strFromU8(buf.subarray(0, 8)) !== MAGIC) throw bad('This is not a backup file from this system (it should end in .itmsbackup)');
  const salt = buf.subarray(8, 24); const iv = buf.subarray(24, 36); const tag = buf.subarray(36, 52); const body = buf.subarray(52);
  let plain;
  try {
    const sealed = new Uint8Array(body.length + 16); sealed.set(body, 0); sealed.set(tag, body.length);
    plain = gcm(deriveKey(password, salt), iv).decrypt(sealed);
  } catch { throw bad('Wrong backup password, or the file is damaged'); }
  let manifest;
  try { manifest = JSON.parse(strFromU8(gunzipSync(plain))); } catch { throw bad('The backup file is damaged'); }
  if (manifest.app !== APP) throw bad('This backup is from a different application');
  if (manifest.format > FORMAT) throw bad('This backup was made by a newer version of the system. Update this app first.');
  const bytes = unb64(manifest.db);
  if (bytes.length > 100 && strFromU8(bytes.subarray(0, 15)) === 'SQLite format 3') { bytes[18] = 1; bytes[19] = 1; }
  let conn;
  try { conn = new (db.engine()).Database(bytes); } catch { throw bad('The database inside the backup could not be opened'); }
  try {
    if (q(conn, 'PRAGMA integrity_check')[0].integrity_check !== 'ok') throw bad('The database inside the backup is damaged');
    const admin = q(conn, "SELECT COUNT(*) n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Admin' AND u.status = 'Active'")[0].n;
    if (!admin) throw bad('The backup has no active Admin account, so nobody could sign in after restoring');
    const closeable = { close: () => conn.close() };
    return { manifest, conn: closeable, raw: conn, summary: { created_at: manifest.created_at, company_name: settingOf(conn, 'company_name'), counts: counts(conn), files: manifest.files.length } };
  } catch (e) { conn.close(); throw e; }
}

function restoreBackup(buffer, password, restoredBy) {
  const { manifest, raw: conn, summary } = openBackup(buffer, password);
  const before = db.exportBytes();
  try {
    const fromKey = hexToBytes(manifest.vault_key);
    const toKey = hexToBytes(vault.keyHex());
    try {
      conn.exec('BEGIN');
      for (const table of ['credentials', 'wifi_networks']) {
        for (const row of q(conn, `SELECT id, password_enc FROM ${table} WHERE password_enc IS NOT NULL`)) {
          conn.run(`UPDATE ${table} SET password_enc = ? WHERE id = ?`, [vault.encryptWith(toKey, vault.decryptWith(fromKey, row.password_enc)), row.id]);
        }
      }
      conn.run('DELETE FROM sessions');
      conn.run("INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_label, details) VALUES (NULL, ?, 'System restored from backup', 'settings', 'Backup', ?)",
        [restoredBy, JSON.stringify({ backup_created: manifest.created_at, files: manifest.files.length })]);
      conn.exec('COMMIT');
    } catch { throw bad('Saved passwords in the backup could not be unlocked; nothing was changed'); }
    const newDb = conn.export();
    conn.close();
    try {
      db.replace(newDb);
      for (const f of manifest.files) {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        db.run('INSERT OR REPLACE INTO _demo_files (name, mime, data) VALUES (?, ?, ?)', f.name, MIME[ext] || 'application/octet-stream', unb64(f.data));
      }
    } catch (e) { db.replace(before); throw e; }
  } catch (e) { try { conn.close(); } catch { /* closed */ } throw e; }
  return { summary, safety_copy: 'the previous data on this device was replaced' };
}

module.exports = { createBackup, openBackup, restoreBackup };
