// Shared UI toolkit: API client, escaping, formatting, badges, modals, forms, tables, toasts.

export const state = { user: null, lookups: null, company: null };

// ───────── API ─────────
async function request(method, url, body, isForm) {
  const opts = { method, headers: { 'X-Requested-With': 'itms' }, credentials: 'same-origin' };
  if (body !== undefined) {
    if (isForm) opts.body = body;
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  const res = await fetch(`/api${url}`, opts);
  if (res.status === 401 && !url.startsWith('/auth/')) { location.hash = '#/login'; throw new Error('Please sign in'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}
export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  put: (u, b = {}) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
  form: (method, u, fd) => request(method, u, fd, true),
};

export async function loadLookups(force = false) {
  if (!state.lookups || force) state.lookups = await api.get('/settings/lookups');
  return state.lookups;
}
export const invalidateLookups = () => { state.lookups = null; };

// The browser preview serves /api images from memory; everywhere else this returns the URL unchanged.
export const resolveImage = async (u) => (u && window.itmsResolveImage ? window.itmsResolveImage(u) : u);

export const can = (perm) => !!state.user && state.user.permissions.includes(perm);

// ───────── Formatting ─────────
export const esc = (v) => (v === null || v === undefined ? '' : String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
export const dash = (v) => (v === null || v === undefined || v === '' ? '<span class="muted">—</span>' : esc(v));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fmtDate(d, long = false) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  if (!y) return esc(d);
  return long ? `${MONTHS[m - 1]} ${day}, ${y}` : `${MONTHS[m - 1].slice(0, 3)} ${day}, ${y}`;
}
// DB timestamps are UTC ("YYYY-MM-DD HH:MM:SS") → show in local time.
export function parseTs(ts) { return ts ? new Date(`${String(ts).replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(ts) ? '' : 'Z'}`) : null; }
export function fmtDateTime(ts) {
  const d = parseTs(ts);
  if (!d || Number.isNaN(d)) return '—';
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
export function timeAgo(ts) {
  const d = parseTs(ts);
  if (!d) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(ts);
}
export const money = (n) => (n === null || n === undefined || n === '' ? '—' : `${state.lookups?.currency || '₱'}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const daysLeft = (d) => { if (!d) return null; const t = new Date(`${d.slice(0, 10)}T00:00:00`); const n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((t - n) / 864e5); };

// ───────── Badges ─────────
const TONE = {
  Available: 'green', Deployed: 'blue', 'Under Repair': 'amber', Damaged: 'orange', Lost: 'red', Retired: 'gray', Disposed: 'gray',
  Active: 'green', Assigned: 'blue', Reserved: 'violet', Offline: 'gray', Conflict: 'red', Blocked: 'red', Inactive: 'gray', Down: 'red', Suspended: 'amber',
  Primary: 'blue', Backup: 'violet', Static: 'slate', DHCP: 'teal',
  Reported: 'amber', Diagnosis: 'amber', 'Waiting for Parts': 'orange', Completed: 'green', Unrepairable: 'red',
  'In Progress': 'blue', Pending: 'gray', Found: 'green', Missing: 'red', Returned: 'gray', Transferred: 'violet',
  'Expiring Soon': 'amber', Expired: 'red', None: 'gray', 'On Leave': 'amber', Resigned: 'gray', Disabled: 'gray', Maintenance: 'amber',
  Admin: 'blue', 'IT Staff': 'teal', Viewer: 'gray',
};
const ICON = { Found: '✓ ', Missing: '✕ ', Damaged: '⚠ ', Conflict: '⚠ ', Expired: '⚠ ' };
export const badge = (s, tone) => (s ? `<span class="badge ${tone || TONE[s] || 'slate'}">${ICON[s] || ''}${esc(s)}</span>` : '<span class="muted">—</span>');

// ───────── Toasts ─────────
export function toast(msg, type = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, type === 'err' ? 5000 : 3000);
}

// ───────── Delegated events ─────────
export function on(root, event, selector, fn) {
  root.addEventListener(event, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  });
}

// ───────── Forms ─────────
// field: { name, label, type, options, required, span, placeholder, help, value, attrs, section }
export const opt = (list, valueKey = 'id', labelFn = (x) => x.name) => list.map((x) => (typeof x === 'string' ? { value: x, label: x } : { value: x[valueKey], label: labelFn(x) }));

export function fieldHtml(f, values = {}) {
  if (f.type === 'section') return `<div class="form-section span-2">${esc(f.label)}${f.help ? `<small>${esc(f.help)}</small>` : ''}</div>`;
  const v = values[f.name] ?? f.value ?? '';
  const id = `f_${f.name}`;
  const req = f.required ? 'required' : '';
  const attrs = f.attrs || '';
  let input;
  switch (f.type) {
    case 'select':
      input = `<select id="${id}" name="${f.name}" ${req} ${attrs}>${f.placeholder !== false ? `<option value="">${esc(f.placeholder || '— Select —')}</option>` : ''}${(f.options || [])
        .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      break;
    case 'textarea':
      input = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" ${req} placeholder="${esc(f.placeholder || '')}" ${attrs}>${esc(v)}</textarea>`;
      break;
    case 'checkbox':
      return `<label class="check ${f.span === 2 ? 'span-2' : ''}"><input type="checkbox" name="${f.name}" value="1" ${v && v !== '0' ? 'checked' : ''} ${attrs}> ${esc(f.label)}</label>`;
    case 'file':
      input = `<input id="${id}" type="file" name="${f.name}" accept="${esc(f.accept || 'image/*')}" ${attrs}>`;
      break;
    case 'static':
      input = `<div class="static-field">${f.html ?? esc(v)}</div>`;
      break;
    default:
      input = `<input id="${id}" type="${f.type || 'text'}" name="${f.name}" value="${esc(v)}" ${req} placeholder="${esc(f.placeholder || '')}" ${f.step ? `step="${f.step}"` : ''} ${attrs} autocomplete="${f.type === 'password' ? 'new-password' : 'off'}">`;
  }
  return `<div class="field ${f.span === 2 ? 'span-2' : ''}"><label for="${id}">${esc(f.label)}${f.required ? ' <b class="req">*</b>' : ''}</label>${input}${f.help ? `<small class="help">${esc(f.help)}</small>` : ''}</div>`;
}
export const formHtml = (fields, values) => `<div class="form-grid">${fields.map((f) => fieldHtml(f, values)).join('')}</div>`;

// Plain object from a form (checkbox → 1/0; files ignored).
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'file' || el.disabled) continue;
    out[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
  }
  return out;
}
export function formData(form) {
  const fd = new FormData();
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'file') { if (el.files[0]) fd.append(el.name, el.files[0]); } else if (el.type === 'checkbox') fd.append(el.name, el.checked ? '1' : '0');
    else fd.append(el.name, el.value);
  }
  return fd;
}

// ───────── Modal ─────────
export function openModal({ title, body, submitLabel = 'Save', size = '', onSubmit, onOpen, danger = false, noFooter = false, cancelLabel = 'Cancel' }) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<form class="modal ${size}" novalidate>
      <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="modal-body"><div class="alert err hidden" data-err></div>${body}</div>
      ${noFooter ? '' : `<div class="modal-foot"><button type="button" class="btn ghost" data-close>${esc(cancelLabel)}</button>
        ${onSubmit ? `<button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(submitLabel)}</button>` : ''}</div>`}
    </form>`;
  root.appendChild(wrap);
  const form = wrap.querySelector('form');
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const err = form.querySelector('[data-err]');
    err.classList.add('hidden');
    const missing = [...form.querySelectorAll('[required]')].find((el) => !el.value.trim());
    if (missing) {
      err.textContent = `${form.querySelector(`label[for="${missing.id}"]`)?.textContent.replace('*', '').trim() || 'A required field'} is required`;
      err.classList.remove('hidden');
      missing.focus();
      return;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const keep = await onSubmit(form, close);
      if (keep !== false) close();
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
      err.scrollIntoView({ block: 'nearest' });
    } finally { btn.disabled = false; }
  });
  if (onOpen) onOpen(form, close);
  setTimeout(() => form.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea')?.focus(), 30);
  return { form, close };
}

export function confirmDialog(title, message, { confirmLabel = 'Confirm', danger = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({ title, body: `<p>${message}</p>`, submitLabel: confirmLabel, danger, onSubmit: () => { done = true; resolve(true); } });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.form)) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.getElementById('modal-root'), { childList: true });
  });
}

// ───────── Tables ─────────
// columns: [{ key, label, render(row) → html, sort(row) → value, cls, nosort }]
export function mountTable(container, { columns, rows, empty = 'No records found', rowHref, pageSize = 50, initialSort }) {
  let sortKey = initialSort?.key || null;
  let sortDir = initialSort?.dir || 1;
  let page = 0;
  const draw = () => {
    let data = rows.slice();
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      const val = col.sort || ((r) => r[col.key]);
      data.sort((a, b) => {
        const x = val(a); const y = val(b);
        if (x === y) return 0;
        if (x === null || x === undefined || x === '') return 1;
        if (y === null || y === undefined || y === '') return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sortDir;
      });
    }
    const pages = Math.max(1, Math.ceil(data.length / pageSize));
    page = Math.min(page, pages - 1);
    const slice = data.slice(page * pageSize, page * pageSize + pageSize);
    container.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr>${columns.map((c) => `<th class="${c.cls || ''} ${c.nosort ? '' : 'sortable'}" data-k="${c.key}">${esc(c.label)}${sortKey === c.key ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${slice.length ? slice.map((r) => `<tr ${rowHref ? `data-href="${esc(rowHref(r))}" class="clickable"` : ''}>${columns.map((c) => `<td class="${c.cls || ''}">${c.render ? c.render(r) : dash(r[c.key])}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${columns.length}" class="empty">${esc(empty)}</td></tr>`}</tbody></table></div>
      <div class="table-foot"><span>${data.length} record${data.length === 1 ? '' : 's'}</span>${pages > 1 ? `<span class="pager"><button class="btn sm ghost" data-pg="-1" ${page === 0 ? 'disabled' : ''}>‹ Prev</button> Page ${page + 1} / ${pages} <button class="btn sm ghost" data-pg="1" ${page >= pages - 1 ? 'disabled' : ''}>Next ›</button></span>` : ''}</div>`;
  };
  container.onclick = (e) => {
    const th = e.target.closest('th.sortable');
    if (th) { const k = th.dataset.k; sortDir = sortKey === k ? -sortDir : 1; sortKey = k; draw(); return; }
    const pg = e.target.closest('[data-pg]');
    if (pg) { page += Number(pg.dataset.pg); draw(); return; }
    if (e.target.closest('a,button,input,select,label')) return;
    const tr = e.target.closest('tr[data-href]');
    if (tr) location.hash = tr.dataset.href;
  };
  draw();
  return { update(newRows) { rows = newRows; page = 0; draw(); } };
}

// ───────── Misc UI ─────────
export const card = (title, body, extra = '') => `<section class="card"><div class="card-head"><h3>${esc(title)}</h3>${extra}</div><div class="card-body">${body}</div></section>`;
export const kv = (pairs) => `<dl class="kv">${pairs.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === undefined || v === null || v === '' ? '<span class="muted">—</span>' : v}</dd>`).join('')}</dl>`;
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
export function filterBar(filters, values = {}) {
  return `<div class="filters">${filters.map((f) => {
    if (f.type === 'search') return `<div class="search-input"><input type="search" name="${f.name}" placeholder="${esc(f.placeholder || 'Search…')}" value="${esc(values[f.name] || '')}"></div>`;
    return `<select name="${f.name}"><option value="">${esc(f.label)}</option>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(values[f.name] ?? '') === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  }).join('')}</div>`;
}
export function readFilters(root) {
  const out = {};
  root.querySelectorAll('.filters [name]').forEach((el) => { if (el.value) out[el.name] = el.value; });
  return out;
}
export const qs = (obj) => { const s = new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString(); return s ? `?${s}` : ''; };
export const setTitle = (t) => { document.title = `${t} · ${state.company?.name || 'IT Management'}`; };

// Secret reveal / copy (credentials & Wi-Fi). Secret is never cached or logged client-side.
export async function revealSecret(url, target, button) {
  if (target.dataset.revealed === '1') { target.textContent = '••••••••••••'; target.dataset.revealed = '0'; button.textContent = 'Show'; return; }
  const { password } = await api.post(url, { purpose: 'reveal' });
  target.textContent = password;
  target.dataset.revealed = '1';
  button.textContent = 'Hide';
  setTimeout(() => { if (target.dataset.revealed === '1') { target.textContent = '••••••••••••'; target.dataset.revealed = '0'; button.textContent = 'Show'; } }, 30000);
}
export async function copySecret(url) {
  const { password } = await api.post(url, { purpose: 'copy' });
  try { await navigator.clipboard.writeText(password); } catch {
    const ta = document.createElement('textarea'); ta.value = password; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast('Password copied to clipboard');
}
