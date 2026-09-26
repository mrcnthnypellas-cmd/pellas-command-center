// App shell: authentication, sidebar layout and hash router.
import { api, state, esc, can, toast, openModal, formHtml, readForm, loadLookups } from './core.js';
import { icon } from './icons.js';
import * as dashboard from './pages/dashboard.js';
import * as assets from './pages/assets.js';
import * as assetImport from './pages/assetImport.js';
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
  { label: 'People', items: [['employees', '#/employees', 'Employees', 'users', 'employees.view']] },
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
  let company = 'IT Management';
  try { company = (await api.get('/public/company')).name; } catch { /* offline */ }
  document.title = `Sign in · ${company}`;
  app.innerHTML = `<div class="login-wrap"><form class="login-card" novalidate>
      <div class="brand-logo" style="width:44px;height:44px;color:#fff">IT</div>
      <h1>${esc(company)}</h1><p class="muted" style="margin:0">IT Asset, Inventory &amp; Network Management</p>
      <div class="alert err hidden" data-err style="margin-top:14px"></div>
      <div class="field"><label for="u">Username</label><input id="u" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus></div>
      <div class="field"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn primary" type="submit">Sign in</button>
      <div class="demo-accounts"><b>Local development accounts</b><br>
        <code>admin / admin123</code> — Admin (full access)<br>
        <code>itstaff / itstaff123</code> — IT Staff<br>
        <code>jtech / jtech123</code> — IT Staff, restricted vault<br>
        <code>viewer / viewer123</code> — Viewer (read-only)</div>
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
      <a class="brand" href="#/dashboard" style="text-decoration:none"><div class="brand-logo">${state.company.logo ? `<img src="${esc(state.company.logo)}" alt="">` : 'IT'}</div><div><b>${esc(state.company.name)}</b><small>IT Management System</small></div></a>
      ${nav}
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu">☰</button>
        <form class="global-search" id="gsearch" role="search">${icon('search')}<input name="q" type="search" placeholder="Search asset tag, serial, employee, IP, MAC, device, ISP, network, location…" autocomplete="off"></form>
        <div class="user-chip" id="userChip"><div class="avatar">${esc(initials(u.full_name))}</div><div class="who"><b>${esc(u.full_name)}</b><small>${esc(u.role)}</small></div></div>
      </header>
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
  } catch {
    state.user = null;
    return renderLogin();
  }
  await loadLookups(true);
  renderShell();
  if (!location.hash || location.hash === '#/login') location.hash = can('dashboard.view') ? '#/dashboard' : '#/assets';
  route();
}

window.addEventListener('hashchange', () => { if (state.user) route(); });
// Let pages ask for a re-render of the current route (after saves).
window.addEventListener('itms:refresh', () => route());
boot();
