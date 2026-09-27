// "Start fresh": erases the records (assets, employees, network, passwords, logs…) so the system
// can be used from zero, while keeping the signed-in admin, roles, asset categories and settings.
// Shared by the PC/desktop server and the phone app (same route code, different SQLite driver).
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db/connection');

// Children before parents; foreign keys are also deferred to the end of the transaction.
const ERASE = ['audit_items', 'inventory_audits', 'asset_returns', 'asset_transfers', 'asset_history', 'asset_assignments',
  'warranty_records', 'maintenance_records', 'documents', 'ip_addresses', 'credential_permissions', 'credentials',
  'wifi_networks', 'network_devices', 'networks', 'isps', 'assets', 'employees', 'phone_contacts', 'activity_logs'];
const FILE_COLUMNS = ['photo_path', 'stored_name'];

const columns = (table) => db.all(`PRAGMA table_info(${table})`).map((c) => c.name);

// Uploaded files that belong to the records being erased (the company logo and sign-in photo stay).
function uploadedFiles(tables) {
  const names = [];
  for (const t of tables) {
    for (const col of columns(t).filter((c) => FILE_COLUMNS.includes(c))) {
      for (const r of db.all(`SELECT ${col} AS f FROM ${t} WHERE ${col} IS NOT NULL AND ${col} != ''`)) names.push(path.basename(r.f));
    }
  }
  return names;
}

function counts() {
  const n = (t) => db.get(`SELECT COUNT(*) AS n FROM ${t}`).n;
  return {
    assets: n('assets'), employees: n('employees'), ip_addresses: n('ip_addresses'), network_devices: n('network_devices'),
    isps: n('isps'), credentials: n('credentials') + n('wifi_networks'), phone_contacts: n('phone_contacts'),
    locations: n('locations'), departments: n('departments'),
    other_users: db.get("SELECT COUNT(*) AS n FROM users WHERE status != 'Deleted'").n - 1,
  };
}

function eraseData(keepUserId, { locations = true, departments = false, users = true } = {}) {
  const tables = [...ERASE, ...(locations ? ['locations'] : []), ...(departments ? ['departments'] : [])];
  const files = uploadedFiles(tables);
  const before = counts();
  db.tx(() => {
    db.run('PRAGMA defer_foreign_keys = ON');
    for (const t of tables) db.run(`DELETE FROM ${t}`);
    if (users) {
      // Other accounts go too. Clear their names from what stays (e.g. "created by" on categories).
      const keep = new Set(['users', ...tables]);
      for (const { name: t } of db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")) {
        if (keep.has(t)) continue;
        for (const fk of db.all(`PRAGMA foreign_key_list(${t})`).filter((k) => k.table === 'users')) {
          if (['sessions', 'user_permissions'].includes(t)) db.run(`DELETE FROM ${t} WHERE ${fk.from} != ?`, keepUserId);
          else db.run(`UPDATE ${t} SET ${fk.from} = NULL WHERE ${fk.from} != ?`, keepUserId);
        }
      }
      db.run('DELETE FROM users WHERE id != ?', keepUserId);
    }
    // Kept accounts may point at a record that no longer exists (e.g. their employee profile).
    for (const fk of db.all('PRAGMA foreign_key_list(users)').filter((k) => tables.includes(k.table))) db.run(`UPDATE users SET ${fk.from} = NULL`);
    try { db.run(`DELETE FROM sqlite_sequence WHERE name IN (${tables.map(() => '?').join(',')})`, ...tables); } catch { /* no AUTOINCREMENT tables */ }
  });
  for (const f of files) fs.rm(path.join(config.UPLOAD_DIR, f), () => {});
  return { erased: before, files: files.length };
}

module.exports = { eraseData, counts };
