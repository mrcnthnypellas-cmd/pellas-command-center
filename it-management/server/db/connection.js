// Single SQLite connection (better-sqlite3 is synchronous and safe to share).
// To move to a cloud DB later, replace this module with an adapter exposing the
// same small surface (all/get/run/tx) used by the routes.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

let db;

function open() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.DB_FILE), { recursive: true });
  db = new Database(config.DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const handle = db;
  require('../lib/migrate').migrate({ all: (sql, ...p) => handle.prepare(sql).all(...p), run: (sql, ...p) => handle.prepare(sql).run(...p) });
  return db;
}

function close() {
  if (db) { db.close(); db = null; }
}

const all = (sql, ...p) => open().prepare(sql).all(...p);
const get = (sql, ...p) => open().prepare(sql).get(...p);
const run = (sql, ...p) => open().prepare(sql).run(...p);
const tx = (fn) => open().transaction(fn)();

module.exports = { open, close, all, get, run, tx };
