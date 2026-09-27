// sql.js (SQLite compiled to JavaScript) with the same small surface as server/db/connection.js.
const schema = require('../../server/db/schema.sql');

let SQL = null;
let db = null;
let depth = 0;

const clean = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));

function open() {
  if (!db) {
    if (!SQL) throw new Error('Database engine not loaded');
    db = new SQL.Database();
    db.exec(schema);
  }
  return { pragma: () => {} };
}
function attach(engine, bytes) {
  SQL = engine;
  db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(schema);
  db.exec('CREATE TABLE IF NOT EXISTS _demo_files (name TEXT PRIMARY KEY, mime TEXT, data BLOB)');
  require('../../server/lib/migrate').migrate({ all, run });
}
function all(sql, ...p) {
  open();
  const st = db.prepare(sql);
  try {
    st.bind(clean(p));
    const rows = [];
    while (st.step()) rows.push(st.getAsObject());
    return rows;
  } finally { st.free(); }
}
const get = (sql, ...p) => all(sql, ...p)[0];
function run(sql, ...p) {
  open();
  db.run(sql, clean(p));
  const changes = db.getRowsModified();
  const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
  return { changes, lastInsertRowid: id };
}
function tx(fn) {
  open();
  const sp = `sp${depth++}`;
  db.exec(`SAVEPOINT ${sp}`);
  try {
    const out = fn();
    db.exec(`RELEASE ${sp}`);
    return out;
  } catch (e) {
    db.exec(`ROLLBACK TO ${sp}`); db.exec(`RELEASE ${sp}`);
    throw e;
  } finally { depth--; }
}
const close = () => {};
const exportBytes = () => db.export();
const isEmpty = () => !get('SELECT 1 AS x FROM users LIMIT 1');
const engine = () => SQL;
// Swap in a whole new database (restore). The file table is recreated empty by attach().
const replace = (bytes) => attach(SQL, bytes);
module.exports = { open, close, all, get, run, tx, attach, exportBytes, isEmpty, engine, replace };
