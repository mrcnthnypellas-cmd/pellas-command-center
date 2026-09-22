// In-browser "server": mounts the real route modules from server/routes and answers the
// frontend's /api requests without a network. Used only by the browser preview build.
const initSqlJs = require('sql.js/dist/sql-asm.js');
const db = require('../server/db/connection'); // → demo/shims/connection.js
const { loadUser, requireAuth, createSession } = require('../server/lib/auth');
const vault = require('../server/lib/vault'); // → demo/shims/vault.js
const fs = require('fs'); // → demo/shims/fs.js
const store = require('./store');

const MOUNTS = [
  ['/api/auth', require('../server/routes/auth')],
  ['/api/dashboard', require('../server/routes/dashboard')],
  ['/api/assets', require('../server/routes/assets')],
  ['/api/assignments', require('../server/routes/assignments')],
  ['/api/employees', require('../server/routes/employees')],
  ['/api/maintenance', require('../server/routes/maintenance')],
  ['/api/audits', require('../server/routes/audits')],
  ['/api/network', require('../server/routes/network')],
  ['/api/vault', require('../server/routes/vault')],
  ['/api/search', require('../server/routes/search')],
  ['/api/reports', require('../server/routes/reports')],
  ['/api/activity', require('../server/routes/activity')],
  ['/api/settings', require('../server/routes/settings')],
  ['/api/users', require('../server/routes/users')],
  ['/api/documents', require('../server/routes/documents')],
];

const DB_KEY = 'itms-demo-db-v1';
const SESSION_KEY = 'itms-demo-session';
let sessionToken = null;

const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let saveTimer = null;
let storageWarned = false;
function persistNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const ok = store.set(DB_KEY, toB64(db.exportBytes()));
  if (!ok && !storageWarned) { storageWarned = true; console.warn('Browser storage unavailable or full — changes last until the page is closed.'); }
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 300);
}
// Don't lose a change made just before the tab closes or reloads.
addEventListener('pagehide', () => { if (saveTimer) persistNow(); });

async function init() {
  const SQL = await initSqlJs();
  const saved = store.get(DB_KEY);
  let bytes = null;
  if (saved) { try { bytes = fromB64(saved); } catch { bytes = null; } }
  db.attach(SQL, bytes);
  if (db.isEmpty()) {
    store.del('itms-demo-vault-key');
    vault.resetKey();
    require('../server/db/seed').seed();
    persist();
  }
  sessionToken = store.get(SESSION_KEY);
  // Open in a working state: sign in as the demo admin the first time.
  if (!sessionToken && !store.get('itms-demo-signed-out')) {
    const admin = db.get("SELECT id FROM users WHERE username = 'admin' AND status = 'Active'");
    if (admin) { createSession(fakeRes(), admin.id); persist(); }
  }
  return SQL;
}

async function resetData() {
  const SQL = await initSqlJs();
  store.del(DB_KEY); store.del('itms-demo-vault-key'); store.del(SESSION_KEY); store.del('itms-demo-signed-out');
  vault.resetKey();
  db.attach(SQL, null);
  require('../server/db/seed').seed();
  sessionToken = null;
  const admin = db.get("SELECT id FROM users WHERE username = 'admin'");
  createSession(fakeRes(), admin.id);
  persistNow();
}

function fakeRes() {
  const res = {
    statusCode: 200, headers: { 'content-type': 'application/json' }, body: '', finished: false,
    status(c) { this.statusCode = c; return this; },
    set(k, v) { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) this.headers[a.toLowerCase()] = b; else this.headers[k.toLowerCase()] = v; return this; },
    setHeader(k, v) { return this.set(k, v); },
    type(t) { this.headers['content-type'] = t; return this; },
    json(o) { this.headers['content-type'] = 'application/json'; this.body = JSON.stringify(o); this.finished = true; return this; },
    send(b) { if (typeof b === 'string' && !this.headers['content-type']) this.headers['content-type'] = 'text/html'; this.body = b; this.finished = true; return this; },
    end() { this.finished = true; return this; },
    cookie(_n, v) { sessionToken = v; store.set(SESSION_KEY, v); store.del('itms-demo-signed-out'); return this; },
    clearCookie() { sessionToken = null; store.del(SESSION_KEY); store.set('itms-demo-signed-out', '1'); return this; },
  };
  return res;
}

async function runChain(handlers, req, res) {
  for (const h of handlers) {
    let proceed = false;
    await h(req, res, (err) => { if (err) throw err; proceed = true; });
    if (!proceed || res.finished) break;
  }
}

// request({ method, url, body, files }) → { status, headers, body }
async function request({ method = 'GET', url, body, files }) {
  const u = new URL(url, 'http://demo.local');
  const req = {
    method, path: u.pathname, originalUrl: url, query: Object.fromEntries(u.searchParams), params: {}, body: body || {},
    cookies: sessionToken ? { itms_session: sessionToken } : {}, ip: 'browser', _files: files || {}, get: () => undefined,
  };
  const res = fakeRes();
  try {
    await new Promise((r) => loadUser(req, res, r));
    if (u.pathname.startsWith('/uploads/')) {
      await new Promise((r) => requireAuth(req, res, r));
      if (!res.finished) {
        const f = fs.readFile(u.pathname);
        if (f) res.type(f.mime || 'application/octet-stream').send(f.data); else res.status(404).json({ error: 'Not found' });
      }
    } else {
      const mount = MOUNTS.find(([p]) => u.pathname === p || u.pathname.startsWith(`${p}/`));
      if (u.pathname === '/api/public/company') {
        const r = db.get("SELECT value FROM settings WHERE key = 'company_name'");
        res.json({ name: r ? r.value : 'My Company' });
      } else if (!mount) res.status(404).json({ error: 'Not found' });
      else {
        const sub = u.pathname.slice(mount[0].length) || '/';
        for (const route of mount[1].routes) {
          if (route.method !== method) continue;
          const m = sub.match(route.re);
          if (!m) continue;
          req.params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
          await runChain(route.handlers, req, res);
          break;
        }
        if (!res.finished) res.status(404).json({ error: 'Not found' });
      }
    }
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? `Unexpected error: ${err.message}` : err.message });
  }
  if (method !== 'GET' && res.statusCode < 400) persist();
  return { status: res.statusCode, headers: res.headers, body: res.body };
}

module.exports = { init, request, resetData };
