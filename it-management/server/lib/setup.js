// First-run setup: a new installation has no users. The person installing it names the company
// and creates their own admin account (no default passwords). Optionally loads the sample data to try things.
const crypto = require('crypto');
const db = require('../db/connection');
const { seed, seedBase } = require('../db/seed');
const { hashPassword } = require('./passwords');
const { bad } = require('./util');

const needsSetup = () => !db.get('SELECT 1 AS x FROM users LIMIT 1');

function validate(d) {
  const company = String(d.company_name || '').trim();
  const fullName = String(d.full_name || '').trim();
  const username = String(d.username || '').trim().toLowerCase();
  const password = String(d.password || '');
  if (!company) throw bad('Enter the company name');
  if (company.length > 80) throw bad('Company name is too long (max 80 characters)');
  if (!fullName) throw bad('Enter your name');
  if (fullName.length > 80) throw bad('Name is too long (max 80 characters)');
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw bad('Username must be 3–32 letters, numbers, dots, dashes or underscores (no spaces)');
  if (password.length < 8) throw bad('Password must be at least 8 characters');
  if (d.confirm !== undefined && d.confirm !== password) throw bad('The two passwords do not match');
  return { company, fullName, username, password, email: String(d.email || '').trim() || null };
}

function logSetup(userId, v, sample) {
  db.run(`INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, entity_label, details) VALUES (?, ?, 'System set up', 'settings', NULL, ?, ?)`,
    userId, v.fullName, v.company, JSON.stringify({ admin: v.username, sample_data: sample }));
}

// Returns the new admin's user id.
function runSetup(d) {
  const v = validate(d);
  if (!needsSetup()) throw Object.assign(new Error('This system is already set up. Sign in instead.'), { status: 409 });
  const sample = !!d.sample_data;
  if (sample) {
    seed();
    return db.tx(() => {
      db.run("UPDATE settings SET value = ? WHERE key = 'company_name'", v.company);
      const admin = db.get("SELECT id FROM users WHERE username = 'admin'");
      db.run('UPDATE users SET username = ?, full_name = ?, email = ?, password_hash = ? WHERE id = ?', v.username, v.fullName, v.email, hashPassword(v.password), admin.id);
      // The sample staff accounts have well-known passwords: lock them.
      for (const u of db.all('SELECT id FROM users WHERE id != ?', admin.id)) {
        db.run("UPDATE users SET status = 'Disabled', password_hash = ? WHERE id = ?", hashPassword(crypto.randomBytes(24).toString('hex')), u.id);
      }
      logSetup(admin.id, v, true);
      return admin.id;
    });
  }
  return db.tx(() => {
    const { roles } = seedBase({ company_name: v.company });
    const id = Number(db.run('INSERT INTO users (username, full_name, email, password_hash, role_id) VALUES (?, ?, ?, ?, ?)',
      v.username, v.fullName, v.email, hashPassword(v.password), roles.Admin).lastInsertRowid);
    logSetup(id, v, false);
    return id;
  });
}

module.exports = { needsSetup, runSetup };
