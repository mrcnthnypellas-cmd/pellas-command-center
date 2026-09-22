import {
  api, esc, badge, can, mountTable, filterBar, readFilters, debounce, setTitle, on, loadLookups, opt, openModal, formHtml, readForm, confirmDialog,
  fmtDateTime, revealSecret, copySecret, toast, qs,
} from '../core.js';
import { afterChange } from './actions.js';
import { activityItem } from './dashboard.js';

export async function render(el) {
  setTitle('Credentials');
  const types = await api.get('/vault/credentials/types');
  el.innerHTML = `<div class="page-head"><div><h1>IT Credentials Vault</h1><p>Encrypted (AES-256-GCM) at rest. Passwords never appear in tables, search, reports or logs — only via Show/Copy, which is permission-checked and audit-logged.</p></div>
    <div class="page-actions">${can('credentials.create') ? '<button class="btn primary" data-new>+ Add credential</button>' : ''}</div></div>
    <div class="alert info">Your access: ${['view', 'reveal', 'copy', 'create', 'edit', 'delete'].map((p) => `${p} ${can(`credentials.${p}`) ? '✓' : '✕'}`).join(' · ')}${!can('credentials.reveal') ? ' — you may still have per-credential grants set by an admin.' : ''}</div>
    <section class="card">${filterBar([{ type: 'search', name: 'q', placeholder: 'Search name, username, device, ISP…' }, { name: 'type', label: 'All types', options: opt(types) }])}<div data-t></div></section>
    ${can('activity.view') ? '<section class="card" style="margin-top:16px"><div class="card-head"><h3>Credential access log</h3><a class="muted" href="#/activity">All activity</a></div><div class="card-body flush"><ul class="list" data-log></ul></div></section>' : ''}`;
  let rows = [];
  const table = mountTable(el.querySelector('[data-t]'), {
    rows,
    columns: [
      { key: 'name', label: 'Credential', render: (c) => `<b style="display:inline-block;min-width:160px">${esc(c.name)}</b>${c.notes ? `<div class="cell-sub">${esc(c.notes)}</div>` : ''}` },
      { key: 'credential_type', label: 'Type', render: (c) => badge(c.credential_type, 'slate') },
      { key: 'device_name', label: 'Device / linked to', render: (c) => (c.device_id ? `<a href="#/devices/${c.device_id}">${esc(c.device_name)}</a>` : c.asset_tag ? `<a class="mono" href="#/assets/${c.asset_id}">${esc(c.asset_tag)}</a>` : c.isp_name ? esc(c.isp_name) : '<span class="muted">—</span>') },
      { key: 'username', label: 'Username', render: (c) => `<span class="mono">${esc(c.username || '—')}</span>` },
      { key: 'password', label: 'Password', nosort: true, render: (c) => `<div style="display:flex;gap:6px;align-items:center;white-space:nowrap"><span class="secret" data-secret="${c.id}">••••••••••••</span>
        ${c.access.reveal ? `<button class="btn xs" data-reveal="${c.id}" title="Show password">Show</button>` : ''}${c.access.copy ? `<button class="btn xs" data-copy="${c.id}" title="Copy password">Copy</button>` : ''}${!c.access.reveal && !c.access.copy ? '<span class="cell-sub">No access</span>' : ''}</div>` },
      { key: 'management_url', label: 'Management URL', render: (c) => (c.management_url ? `<span class="mono">${esc(c.management_url)}</span>` : '<span class="muted">—</span>') },
      { key: 'created_by_name', label: 'Created by' },
      { key: 'updated_at', label: 'Updated', render: (c) => `<span class="nowrap">${fmtDateTime(c.updated_at)}</span>` },
      { key: 'last_accessed_at', label: 'Last accessed', render: (c) => (c.last_accessed_at ? `<span class="nowrap">${fmtDateTime(c.last_accessed_at)}</span><div class="cell-sub">${esc(c.last_accessed_by_name || '')}</div>` : '<span class="muted">Never</span>') },
      { key: 'x', label: '', nosort: true, render: (c) => `<div class="btn-group">${c.access.edit ? `<button class="btn xs" data-edit="${c.id}">Edit</button>` : ''}${can('users.manage') ? `<button class="btn xs" data-perm="${c.id}">Access</button>` : ''}${c.access.delete ? `<button class="btn xs ghost" data-del="${c.id}">Delete</button>` : ''}</div>` },
    ],
  });
  const loadLog = async () => {
    const ul = el.querySelector('[data-log]');
    if (!ul) return;
    const log = await api.get('/activity?entity_type=credential&limit=10');
    ul.innerHTML = log.map(activityItem).join('') || '<li class="muted">No access yet</li>';
  };
  const load = async () => {
    try {
      rows = await api.get(`/vault/credentials${qs(readFilters(el))}`);
      table.update(rows);
    } catch (e) {
      el.querySelector('[data-t]').innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
    }
    loadLog();
  };
  el.querySelector('.filters').addEventListener('input', debounce(load));
  on(el, 'click', '[data-reveal]', async (_e, b) => {
    try { await revealSecret(`/vault/credentials/${b.dataset.reveal}/secret`, el.querySelector(`[data-secret="${b.dataset.reveal}"]`), b); loadLog(); } catch (ex) { toast(ex.message, 'err'); }
  });
  on(el, 'click', '[data-copy]', async (_e, b) => {
    try { await copySecret(`/vault/credentials/${b.dataset.copy}/secret`); loadLog(); } catch (ex) { toast(ex.message, 'err'); }
  });
  on(el, 'click', '[data-new]', () => credentialModal(types));
  on(el, 'click', '[data-edit]', (_e, b) => credentialModal(types, rows.find((c) => String(c.id) === b.dataset.edit)));
  on(el, 'click', '[data-perm]', (_e, b) => permissionModal(rows.find((c) => String(c.id) === b.dataset.perm)));
  on(el, 'click', '[data-del]', async (_e, b) => {
    const c = rows.find((x) => String(x.id) === b.dataset.del);
    if (await confirmDialog('Delete credential', `Permanently delete <b>${esc(c.name)}</b>?`, { confirmLabel: 'Delete' })) { await api.del(`/vault/credentials/${c.id}`); await afterChange('Credential deleted'); }
  });
  await load();
}

async function credentialModal(types, c = null) {
  const L = await loadLookups();
  openModal({
    title: c ? `Edit ${c.name}` : 'Add credential',
    size: 'lg',
    body: `<div class="alert info">The password is encrypted before it is stored. Use sample/fake values while testing locally.</div>${formHtml([
      { name: 'name', label: 'Credential name', required: true, placeholder: 'Main Router Admin' },
      { name: 'credential_type', label: 'Credential type', type: 'select', required: true, options: opt(types) },
      { name: 'username', label: 'Username' },
      { name: 'password', label: c ? 'New password (leave blank to keep current)' : 'Password', type: 'password', required: !c },
      { name: 'device_id', label: 'Network device', type: 'select', options: opt(L.devices, 'id', (d) => `${d.name} (${d.device_type})`) },
      { name: 'asset_id', label: 'Asset (e.g. server)', type: 'select', options: opt(L.assets, 'id', (a) => `${a.asset_tag} — ${a.name}`) },
      { name: 'isp_id', label: 'ISP account', type: 'select', options: opt(L.isps, 'id', (i) => `${i.provider_name} — ${i.connection_name}`) },
      { name: 'management_url', label: 'Management URL' },
      { name: 'notes', label: 'Notes (never put passwords here)', type: 'textarea', span: 2 },
    ], c || {})}`,
    onSubmit: async (f) => {
      const b = readForm(f);
      if (c) await api.put(`/vault/credentials/${c.id}`, b); else await api.post('/vault/credentials', b);
      await afterChange('Credential saved');
    },
  });
}

async function permissionModal(c) {
  const users = await api.get(`/vault/credentials/${c.id}/permissions`);
  openModal({
    title: `Access to “${c.name}”`,
    size: 'lg',
    body: `<p class="muted" style="margin-top:0">Per-credential grants for users who do <b>not</b> have the global credential permissions (e.g. an IT Staff member restricted to one device). Viewers should not be granted access.</p>
      <table class="table"><thead><tr><th>User</th><th>Role</th><th>Reveal</th><th>Copy</th></tr></thead><tbody>${users.map((u) => `<tr><td>${esc(u.full_name)} <span class="cell-sub">${esc(u.username)}</span></td><td>${badge(u.role)}</td>
        <td><input type="checkbox" data-u="${u.user_id}" data-k="can_reveal" ${u.can_reveal ? 'checked' : ''}></td><td><input type="checkbox" data-u="${u.user_id}" data-k="can_copy" ${u.can_copy ? 'checked' : ''}></td></tr>`).join('')}</tbody></table>`,
    onSubmit: async (f) => {
      const grants = users.map((u) => ({
        user_id: u.user_id,
        can_reveal: f.querySelector(`[data-u="${u.user_id}"][data-k=can_reveal]`).checked,
        can_copy: f.querySelector(`[data-u="${u.user_id}"][data-k=can_copy]`).checked,
      })).map((g) => ({ ...g, can_view: g.can_reveal || g.can_copy }));
      await api.put(`/vault/credentials/${c.id}/permissions`, { grants });
      toast('Access updated');
    },
  });
}
