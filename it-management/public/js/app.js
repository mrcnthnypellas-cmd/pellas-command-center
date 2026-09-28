// App shell: authentication, sidebar layout and hash router.
import { api, state, esc, can, toast, openModal, formHtml, readForm, loadLookups, resolveImage } from './core.js';
import { icon } from './icons.js';
import * as dashboard from './pages/dashboard.js';
import * as assets from './pages/assets.js';
import * as assetImport from './pages/assetImport.js';
import * as directory from './pages/directory.js';
import * as employees from './pages/employees.js';
import * as assignments from './pages/assignments.js';
import * as maintenance from './pages/maintenance.js';
import * as audits from './pages/audits.js';
import * as network from './pages/network.js';
import * as vault from './pages/vault.js';
import * as reports from './pages/reports.js';
import * as activity from './pages/activity.js';
import * as settings from './pages/settings.js';
import * as search from './pages/search.js';
import * as print from './pages/print.js';

const app = document.getElementById('app');

// [pattern, handler, permission, navKey]
const ROUTES = [
  [/^\/?$/, dashboard.render, 'dashboard.view', 'dashboard'],
  [/^\/dashboard$/, dashboard.render, 'dashboard.view', 'dashboard'],
  [/^\/assets$/, assets.list, 'assets.view', 'assets'],
  [/^\/assets\/new$/, assets.form, 'assets.create', 'assets-new'],
  [/^\/assets\/import$/, assetImport.page, 'assets.view', 'assets-import'],
  [/^\/assets\/([^/]+)\/edit$/, assets.form, 'assets.edit', 'assets'],
  [/^\/assets\/([^/]+)$/, assets.profile, 'assets.view', 'assets'],
  [/^\/categories$/, assets.categories, 'assets.view', 'categories'],
  [/^\/audits$/, audits.list, 'audits.view', 'audits'],
  [/^\/audits\/(\d+)$/, audits.detail, 'audits.view', 'audits'],
  [/^\/employees$/, employees.list, 'employees.view', 'employees'],
  [/^\/employees\/(\d+)$/, employees.profile, 'employees.view', 'employees'],
  [/^\/directory$/, directory.page, 'directory.view', 'directory'],
  [/^\/assignments$/, assignments.list, 'assets.view', 'assignments'],
  [/^\/deploy$/, assignments.deploy, 'assets.view', 'deploy'],
  [/^\/returns$/, assignments.returns, 'assets.view', 'returns'],
  [/^\/transfers$/, assignments.transfers, 'assets.view', 'transfers'],
  [/^\/ips$/, network.ips, 'network.view', 'ips'],
  [/^\/networks$/, network.networks, 'network.view', 'networks'],
  [/^\/networks\/(\d+)$/, network.networkDetail, 'network.view', 'networks'],
  [/^\/devices$/, network.devices, 'network.view', 'devices'],
  [/^\/devices\/(\d+)$/, network.deviceDetail, 'network.view', 'devices'],
  [/^\/isps$/, network.isps, 'network.view', 'isps'],
  [/^\/topology$/, network.topology, 'network.view', 'topology'],
  [/^\/wifi$/, network.wifi, 'wifi.view', 'wifi'],
  [/^\/maintenance$/, maintenance.list, 'maintenance.view', 'maintenance'],
  [/^\/warranty$/, maintenance.warranty, 'maintenance.view', 'warranty'],
  [/^\/reports$/, reports.index, 'reports.view', 'reports'],
  [/^\/reports\/([\w-]+)$/, reports.view, 'reports.view', 'reports'],
  [/^\/activity$/, activity.render, 'activity.view', 'activity'],
  [/^\/credentials$/, vault.render, null, 'credentials'],
  [/^\/settings$/, settings.render, null, 'settings'],
  [/^\/search$/, search.render, null, null],
  [/^\/print\/accountability\/(\d+)$/, print.accountability, 'employees.view', null],
  [/^\/print\/labels$/, print.labels, 'assets.view', 'labels'],
];

const NAV = [
  { items: [['dashboard', '#/dashboard', 'Dashboard', 'dashboard', 'dashboard.view']] },
  { label: 'Assets', items: [
    ['assets', '#/assets', 'All Assets', 'box', 'assets.view'],
    ['assets-new', '#/assets/new', 'Add Asset', 'plus', 'assets.create'],
    ['assets-import', '#/assets/import', 'Import / Export', 'upload', 'assets.view'],
    ['labels', '#/print/labels', 'QR Labels', 'qr', 'assets.view'],
    ['categories', '#/categories', 'Categories', 'tag', 'assets.view'],
    ['audits', '#/audits', 'Audit', 'clipboard', 'audits.view'],
  ] },
  { label: 'People', items: [
    ['employees', '#/employees', 'Employees', 'users', 'employees.view'],
    ['directory', '#/directory', 'Phone Directory', 'phone', 'directory.view'],
  ] },
  { label: 'Assignments', items: [
    ['assignments', '#/assignments', 'All Assignments', 'link', 'assets.view'],
    ['deploy', '#/deploy', 'Deploy', 'send', 'assets.view'],
    ['returns', '#/returns', 'Returns', 'undo', 'assets.view'],
    ['transfers', '#/transfers', 'Transfers', 'swap', 'assets.view'],
  ] },
  { label: 'Network', items: [
    ['ips', '#/ips', 'IP Addresses', 'hash', 'network.view'],
    ['networks', '#/networks', 'Networks', 'grid', 'network.view'],
    ['devices', '#/devices', 'Network Devices', 'router', 'network.view'],
    ['isps', '#/isps', 'ISPs', 'globe', 'network.view'],
    ['topology', '#/topology', 'Topology', 'tree', 'network.view'],
    ['wifi', '#/wifi', 'Wi-Fi', 'wifi', 'wifi.view'],
  ] },
  { label: 'Care', items: [
    ['maintenance', '#/maintenance', 'Maintenance', 'wrench', 'maintenance.view'],
    ['warranty', '#/warranty', 'Warranty', 'shield', 'maintenance.view'],
  ] },
  { label: 'Insights', items: [
    ['reports', '#/reports', 'Reports', 'chart', 'reports.view'],
    ['activity', '#/activity', 'Activity Logs', 'activity', 'activity.view'],
  ] },
  { label: 'Security', items: [
    ['credentials', '#/credentials', 'Credentials', 'key', 'credentials.view'],
    ['settings', '#/settings', 'Settings', 'settings', null],
  ] },
];

// ───────── Login ─────────
async function renderLogin() {
  let b = { company_name: 'IT Management', system_name: 'IT Management System', login_message: '', login_bg_preset: 'default' };
  try { b = await api.get('/public/branding'); } catch { /* offline: keep defaults */ }
  [b.login_bg_url, b.logo_url] = await Promise.all([resolveImage(b.login_bg_url), resolveImage(b.logo_url)]);
  document.title = `Sign in · ${b.company_name}`;
  window.scrollTo(0, 0); // signing out from a scrolled page must not leave the sign-in page scrolled
  app.innerHTML = `<div class="login-wrap bg-${esc(b.login_bg_preset)} ${b.login_bg_url ? 'has-photo' : ''}">
    ${b.login_bg_url ? `<img class="login-bg" src="${esc(b.login_bg_url)}" alt="">` : ''}
    <form class="login-card" novalidate>
      <div class="brand-logo" style="width:44px;height:44px;color:#fff">${b.logo_url ? `<img src="${esc(b.logo_url)}" alt="">` : 'IT'}</div>
      <h1>${esc(b.company_name)}</h1><p class="muted" style="margin:0">${esc(b.system_name)}</p>
      ${b.login_message ? `<p class="login-message">${esc(b.login_message)}</p>` : ''}
      <div class="alert err hidden" data-err style="margin-top:14px"></div>
      <div class="field"><label for="u">Username</label><input id="u" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus></div>
      <div class="field"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn primary" type="submit">Sign in</button>
    </form></div>`;
  const form = app.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('[data-err]');
    err.classList.add('hidden');
    try {
      await api.post('/auth/login', readForm(form));
      await boot();
    } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
  });
}

// ───────── First-run setup ─────────
// A new installation has no accounts: the person installing it names the company and creates their admin login.
function renderSetup() {
  document.title = "Let's set up your application";
  window.scrollTo(0, 0);
  app.innerHTML = `<div class="login-wrap bg-default">
    <form class="login-card setup-card" novalidate>
      <div class="brand-logo" style="width:44px;height:44px;color:#fff">IT</div>
      <h1>Let's set up your application</h1>
      <p class="muted" style="margin:0">Welcome! This takes a minute. You'll use this account to sign in and manage everything.</p>
      <div class="alert err hidden" data-err style="margin-top:14px"></div>
      <div class="setup-section">License</div>
      <div class="field"><label for="s-license">License key</label><textarea id="s-license" name="license_key" rows="3" class="license-input" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus placeholder="ITMS1.…"></textarea>
        <small class="muted">Paste the license key you received. It starts with <b>ITMS1.</b></small></div>
      <div class="setup-section">Company</div>
      <div class="field"><label for="s-company">Company name</label><input id="s-company" name="company_name" maxlength="80" required placeholder="e.g. Pellas Corporation"></div>
      <div class="setup-section">Your admin account</div>
      <div class="field"><label for="s-name">Your full name</label><input id="s-name" name="full_name" maxlength="80" autocomplete="name" required></div>
      <div class="field"><label for="s-user">Username</label><input id="s-user" name="username" maxlength="32" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required placeholder="e.g. mark">
        <small class="muted">3–32 letters or numbers, no spaces. You'll type this to sign in.</small></div>
      <div class="field"><label for="s-pw">Password</label><input id="s-pw" name="password" type="password" autocomplete="new-password" required>
        <small class="muted">At least 8 characters. There's no "forgot password" e-mail, so keep it somewhere safe.</small></div>
      <div class="field"><label for="s-pw2">Confirm password</label><input id="s-pw2" name="confirm" type="password" autocomplete="new-password" required></div>
      <label class="check" style="margin-top:10px;font-size:13px"><input type="checkbox" data-show> Show passwords</label>
      <label class="check setup-sample"><input type="checkbox" name="sample_data"> <span><b>Add sample data so I can try the system first</b><br>
        <span class="muted">Example assets, employees and network. Erase it anytime in Settings → Backup &amp; Restore → Start fresh.</span></span></label>
      <button class="btn primary" type="submit">Finish setup and sign in</button>
      <p class="muted" style="font-size:12.5px;margin:14px 0 0">Moving from another PC or phone? Finish this setup first, then restore your backup in <b>Settings → Backup &amp; Restore</b>.</p>
    </form></div>`;
  const form = app.querySelector('form');
  form.querySelector('[data-show]').addEventListener('change', (e) => {
    form.querySelectorAll('#s-pw, #s-pw2').forEach((i) => { i.type = e.target.checked ? 'text' : 'password'; });
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('[data-err]');
    const b = readForm(form);
    const show = (m) => { err.textContent = m; err.classList.remove('hidden'); err.scrollIntoView({ block: 'nearest' }); };
    err.classList.add('hidden');
    if (!/^ITMS1\./.test((b.license_key || '').replace(/\s+/g, ''))) return show('Paste your license key (it starts with ITMS1.)');
    if (!b.company_name?.trim()) return show('Enter the company name');
    if (!b.full_name?.trim()) return show('Enter your name');
    if (!/^[a-z0-9._-]{3,32}$/i.test((b.username || '').trim())) return show('Username must be 3–32 letters, numbers, dots, dashes or underscores (no spaces)');
    if ((b.password || '').length < 8) return show('Password must be at least 8 characters');
    if (b.password !== b.confirm) return show('The two passwords do not match');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = b.sample_data ? 'Setting up with sample data…' : 'Setting up…';
    try {
      await api.post('/public/setup', { ...b, sample_data: !!b.sample_data });
      location.hash = '#/dashboard';
      await boot();
      toast(`Welcome, ${b.full_name.trim().split(/\s+/)[0]}! Your system is ready.`);
    } catch (ex) { show(ex.message); btn.disabled = false; btn.textContent = 'Finish setup and sign in'; }
  });
}

// ───────── License required / expired ─────────
function renderLicenseLock() {
  const L = state.user.license || {};
  const admin = can('settings.manage');
  const title = L.state === 'expired' ? 'Your license has expired' : L.state === 'clock' ? "This computer's date looks wrong" : 'A license key is needed';
  const msg = L.state === 'expired' ? `The license for <b>${esc(L.licensee)}</b> ended on <b>${esc(L.expires)}</b>. Enter a renewed key to continue. Your data is safe and nothing was deleted.`
    : L.state === 'clock' ? `The date on this computer is earlier than the last date the system was used (${esc(L.last_seen)}). Set the correct date and time, then reopen the app.`
      : 'Enter a valid license key to use the system.';
  document.title = title;
  window.scrollTo(0, 0);
  app.innerHTML = `<div class="login-wrap bg-default"><div class="login-card setup-card">
    <div class="brand-logo" style="width:44px;height:44px;color:#fff">IT</div>
    <h1>${esc(title)}</h1><p class="muted" style="margin:0">${msg}</p>
    ${admin ? `<form data-lic novalidate>
      <div class="alert err hidden" data-err style="margin-top:14px"></div>
      <div class="field"><label for="lic-key">New license key</label><textarea id="lic-key" name="key" rows="3" class="license-input" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="ITMS1.…"></textarea></div>
      <button class="btn primary" type="submit">Activate license</button></form>
      <form data-bk novalidate>
        <div class="setup-section">Keep a copy of your data</div>
        <p class="muted" style="margin:6px 0 0;font-size:13px">You can still download a full backup while the license is inactive.</p>
        <div class="field"><label for="lic-bk">Backup password (8+ characters)</label><input id="lic-bk" name="password" type="password" autocomplete="new-password"></div>
        <button class="btn" type="submit">Download backup</button></form>`
    : '<p class="alert warn" style="margin-top:14px">Ask your system administrator to enter a renewed license key.</p>'}
    <button class="btn ghost" type="button" data-out>Sign out</button>
  </div></div>`;
  app.querySelector('[data-out]').addEventListener('click', async () => { await api.post('/auth/logout'); state.user = null; renderLogin(); });
  const f = app.querySelector('[data-lic]');
  f?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = f.querySelector('[data-err]');
    err.classList.add('hidden');
    try {
      await api.post('/license', { key: f.elements.key.value });
      await boot();
      toast('License activated. Thank you!');
    } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
  });
  const bk = app.querySelector('[data-bk]');
  bk?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = bk.elements.password.value;
    if (password.length < 8) { toast('The backup password must be at least 8 characters', 'err'); return; }
    const res = await fetch('/api/backup/download', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'itms', 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    if (!res.ok) { toast((await res.json().catch(() => ({}))).error || 'Backup failed', 'err'); return; }
    const name = (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'backup.itmsbackup';
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    toast('Backup downloaded. Keep it and its password safe.');
  });
}

// ───────── Shell ─────────
function initials(name) { return name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase(); }

function renderShell() {
  const u = state.user;
  const nav = NAV.map((g) => {
    const items = g.items.filter(([key, , , , perm]) => {
      if (key === 'credentials') return can('credentials.view') || u.role !== 'Viewer';
      if (key === 'settings') return can('settings.manage') || can('users.manage');
      if (key === 'assets-import') return can('assets.create') || can('assets.edit') || can('reports.export');
      return !perm || can(perm);
    });
    if (!items.length) return '';
    return `<div class="nav-group">${g.label ? `<div class="nav-label">${g.label}</div>` : ''}<nav class="nav">${items.map(([key, href, label, ic]) => `<a href="${href}" data-nav="${key}">${icon(ic)}<span>${label}</span></a>`).join('')}</nav></div>`;
  }).join('');
  app.innerHTML = `<div class="layout">
    <aside class="sidebar" id="sidebar">
      <a class="brand" href="#/dashboard" style="text-decoration:none"><div class="brand-logo">${state.company.logo ? `<img src="${esc(state.company.logo)}" alt="">` : 'IT'}</div><div><b data-brand-company>${esc(state.company.name)}</b><small data-brand-system>${esc(state.company.system_name)}</small></div></a>
      ${nav}
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu">☰</button>
        <form class="global-search" id="gsearch" role="search">${icon('search')}<input name="q" type="search" placeholder="Search asset tag, serial, employee, IP, MAC, device, ISP, network, location…" autocomplete="off"></form>
        <div class="user-chip" id="userChip"><div class="avatar">${esc(initials(u.full_name))}</div><div class="who"><b>${esc(u.full_name)}</b><small>${esc(u.role)}</small></div></div>
      </header>
      ${state.user.license?.warn ? `<div class="license-banner">License for <b>${esc(state.user.license.licensee)}</b> expires in <b>${state.user.license.days_left} day(s)</b> (${esc(state.user.license.expires)}).${can('settings.manage') ? ' <a href="#/settings?tab=license">Enter a renewed key</a>' : ' Please tell your administrator.'}</div>` : ''}
      <main class="content" id="content"></main>
    </div></div>`;
  document.getElementById('gsearch').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
  });
  document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('userChip').addEventListener('click', (e) => {
    const chip = e.currentTarget;
    const existing = chip.querySelector('.dropdown');
    if (existing) { existing.remove(); return; }
    const dd = document.createElement('div');
    dd.className = 'dropdown';
    dd.innerHTML = `<div style="padding:8px 10px" class="muted">Signed in as <b>${esc(u.username)}</b></div>
      <button data-a="theme">Toggle dark / light</button><button data-a="pw">Change password</button><button data-a="out">Sign out</button>`;
    chip.appendChild(dd);
    dd.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const a = ev.target.dataset.a;
      dd.remove();
      if (a === 'out') { await api.post('/auth/logout'); state.user = null; location.hash = '#/login'; renderLogin(); }
      if (a === 'pw') changePassword();
      if (a === 'theme') {
        const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        const next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem('itms-theme', next); } catch { /* ignore */ }
        route();
      }
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#userChip')) document.querySelector('#userChip .dropdown')?.remove();
    if (!e.target.closest('.row-actions')) document.querySelectorAll('.row-actions .dropdown').forEach((x) => x.classList.add('hidden'));
  });
}

function changePassword() {
  openModal({
    title: 'Change password',
    body: formHtml([
      { name: 'current_password', label: 'Current password', type: 'password', required: true, span: 2 },
      { name: 'new_password', label: 'New password (min 8 characters)', type: 'password', required: true, span: 2 },
    ]),
    onSubmit: async (form) => { await api.post('/auth/change-password', readForm(form)); toast('Password changed'); },
  });
}

// ───────── Router ─────────
async function route() {
  if (!state.user) return;
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  document.getElementById('sidebar')?.classList.remove('open');
  const old = document.getElementById('content');
  if (!old) return;
  // Fresh element per render so page-level event listeners never pile up.
  const content = old.cloneNode(false);
  old.replaceWith(content);
  for (const [re, handler, perm, navKey] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
    if (perm && !can(perm)) {
      content.innerHTML = `<div class="card"><div class="empty-state"><h3>Access denied</h3><p>Your account does not have the <code>${esc(perm)}</code> permission.</p></div></div>`;
      return;
    }
    content.innerHTML = '<div class="muted" style="padding:20px">Loading…</div>';
    window.scrollTo(0, 0);
    try {
      await handler(content, m.slice(1).map(decodeURIComponent), params);
    } catch (e) {
      content.innerHTML = `<div class="card"><div class="empty-state"><h3>Something went wrong</h3><p>${esc(e.message)}</p><a class="btn" href="#/dashboard">Back to dashboard</a></div></div>`;
    }
    return;
  }
  content.innerHTML = '<div class="card"><div class="empty-state"><h3>Page not found</h3><a class="btn" href="#/dashboard">Go to dashboard</a></div></div>';
}

async function boot() {
  try { const t = localStorage.getItem('itms-theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* ignore */ }
  try {
    const me = await api.get('/auth/me');
    state.user = me;
    state.company = me.company;
    // Builds without Excel/PDF (phone app) hide those buttons and show CSV instead (see .needs-xlsx / .needs-pdf).
    const features = me.features || { xlsx: true, pdf: true };
    document.documentElement.classList.toggle('no-xlsx', !features.xlsx);
    document.documentElement.classList.toggle('no-pdf', !features.pdf);
    state.company.logo = await resolveImage(me.company.logo);
  } catch {
    state.user = null;
    let setup = { needed: false };
    try { setup = await api.get('/public/setup'); } catch { /* older server: just sign in */ }
    return setup.needed ? renderSetup() : renderLogin();
  }
  if (!state.user.license?.valid) return renderLicenseLock();
  await loadLookups(true);
  renderShell();
  if (!location.hash || location.hash === '#/login') location.hash = can('dashboard.view') ? '#/dashboard' : '#/assets';
  route();
}

window.addEventListener('hashchange', () => { if (state.user && state.user.license?.valid !== false) route(); });
let licenseRecheck = null;
window.addEventListener('itms:license', () => { clearTimeout(licenseRecheck); licenseRecheck = setTimeout(boot, 50); });
// Let pages ask for a re-render of the current route (after saves).
window.addEventListener('itms:refresh', () => route());
boot();
