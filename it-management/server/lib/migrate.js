// Small upgrades applied every time the database opens, so databases created by an older
// version (including restored backups) pick up new features. Must be safe to run repeatedly.
const { PERMISSIONS, ROLE_DEFAULTS } = require('./permissions');

// q: { all(sql, ...params) → rows, run(sql, ...params) } for whichever SQLite driver is in use.
function migrate(q) {
  const roles = q.all('SELECT id, name FROM roles');
  if (!roles.length) return; // brand-new database: the seed/setup inserts everything
  const have = new Set(q.all('SELECT key FROM permissions').map((r) => r.key));
  for (const [key, module, description] of PERMISSIONS) {
    if (have.has(key)) continue;
    q.run('INSERT INTO permissions (key, module, description) VALUES (?, ?, ?)', key, module, description);
    for (const role of roles) {
      if ((ROLE_DEFAULTS[role.name] || []).includes(key)) q.run('INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', role.id, key);
    }
  }
}

module.exports = { migrate };
