import { api, esc, badge, can, mountTable, setTitle, on, openModal, formHtml, readForm, formData, opt, confirmDialog, toast, fmtDateTime, state, kv, card } from '../core.js';
import { afterChange } from './actions.js';

export async function render(el, _m, params) {
  setTitle('Settings');
  const tabs = [
    can('settings.manage') && ['company', 'Company'],
    can('settings.manage') && ['departments', 'Departments'],
    can('settings.manage') && ['locations', 'Locations'],
    can('settings.manage') && ['categories', 'Asset Categories'],
    can('settings.manage') && ['numbering', 'Numbering & Alerts'],
    can('users.manage') && ['users', 'Users'],
    can('users.manage') && ['roles', 'Roles & Permissions'],
    ['system', 'System'],
  ].filter(Boolean);
  const tab = tabs.find((t) => t[0] === params.tab) ? params.tab : tabs[0][0];
  el.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Company profile, lookup lists, numbering, users and permissions.</p></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div><div data-pane></div>`;
  el.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) location.hash = `#/settings?tab=${b.dataset.tab}`; });
  const pane = el.querySelector('[data-pane]');
  await PANES[tab](pane);
}

const PANES = {
  async company(el) {
    const c = await api.get('/settings/company');
    el.innerHTML = `<form class="card page-form" novalidate><div class="card-body">${c.company_logo_url ? `<img src="${esc(c.company_logo_url)}" alt="logo" style="max-height:56px;margin-bottom:12px">` : ''}${formHtml([
      { name: 'company_name', label: 'Company name', required: true }, { name: 'logo', label: 'Logo', type: 'file' },
      { name: 'company_address', label: 'Address', span: 2 }, { name: 'company_phone', label: 'Phone' }, { name: 'company_email', label: 'Email', type: 'email' },
      { name: 'company_website', label: 'Website' }, { name: 'currency_symbol', label: 'Currency symbol' },
    ], c)}</div><div class="form-actions"><button class="btn primary" type="submit">Save company</button></div></form>`;
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api.form('PUT', '/settings/company', formData(e.target)); toast('Company settings saved — reloading'); setTimeout(() => location.reload(), 600); } catch (ex) { toast(ex.message, 'err'); }
    });
  },
  departments: (el) => lookupPane(el, 'departments', 'Department', [{ key: 'name', label: 'Department' }, { key: 'code', label: 'Code' }, { key: 'description', label: 'Description' }],
    [{ name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Code' }, { name: 'description', label: 'Description', span: 2 }]),
  locations: (el) => lookupPane(el, 'locations', 'Location', [{ key: 'name', label: 'Location' }, { key: 'building', label: 'Building' }, { key: 'floor', label: 'Floor' }, { key: 'room', label: 'Room' }, { key: 'address', label: 'Address' }],
    [{ name: 'name', label: 'Display name', required: true, span: 2, placeholder: 'Main Office - 2nd Floor' }, { name: 'building', label: 'Building' }, { name: 'floor', label: 'Floor' }, { name: 'room', label: 'Room / office' }, { name: 'address', label: 'Address' }, { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }]),
  async categories(el) { el.innerHTML = '<div class="card"><div class="card-body">Asset categories and their tag prefixes are managed on the <a href="#/categories">Categories page</a>.</div></div>'; },
  async numbering(el) {
    const c = await api.get('/settings/company');
    const preview = () => `LAP${c.tag_separator ?? '-'}${'1'.padStart(Number(c.tag_padding || 4), '0')}`;
    el.innerHTML = `<form class="card page-form" novalidate><div class="card-body">${formHtml([
      { type: 'section', label: 'Asset tag numbering', help: 'Tags are <PREFIX><separator><number>. The prefix comes from each category.' },
      { name: 'tag_padding', label: 'Number of digits', type: 'number', help: '4 → LAP-0001, 3 → LAP-001' },
      { name: 'tag_separator', label: 'Separator', help: 'Usually a dash' },
      { name: 'preview', label: 'Preview', type: 'static', html: `<b class="mono" data-preview>${esc(preview())}</b>` },
      { type: 'section', label: 'Alerts' },
      { name: 'warranty_alert_days', label: 'Warranty “expiring soon” (days)', type: 'number' },
      { name: 'contract_alert_days', label: 'ISP contract “expiring soon” (days)', type: 'number' },
    ], c)}</div><div class="form-actions"><button class="btn primary" type="submit">Save</button></div></form>`;
    const f = el.querySelector('form');
    f.addEventListener('input', () => { c.tag_padding = f.tag_padding.value; c.tag_separator = f.tag_separator.value; f.querySelector('[data-preview]').textContent = preview(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api.put('/settings/company', readForm(f)); toast('Saved'); } catch (ex) { toast(ex.message, 'err'); }
    });
  },
  async users(el) {
    const [users, rp] = await Promise.all([api.get('/users'), api.get('/users/roles')]);
    el.innerHTML = `<section class="card"><div class="card-head"><h3>System users</h3><button class="btn sm primary" data-new>+ Add user</button></div><div data-t></div></section>`;
    mountTable(el.querySelector('[data-t]'), {
      rows: users,
      columns: [
        { key: 'full_name', label: 'Name', render: (u) => `<b>${esc(u.full_name)}</b><div class="cell-sub">${esc(u.email || '')}</div>` },
        { key: 'username', label: 'Username', render: (u) => `<span class="mono">${esc(u.username)}</span>` },
        { key: 'role', label: 'Role', render: (u) => badge(u.role) },
        { key: 'overrides', label: 'Custom permissions', render: (u) => (u.overrides ? badge(`${u.overrides} override(s)`, 'amber') : '<span class="muted">Role defaults</span>') },
        { key: 'status', label: 'Status', render: (u) => badge(u.status) },
        { key: 'last_login_at', label: 'Last sign-in', render: (u) => (u.last_login_at ? fmtDateTime(u.last_login_at) : '<span class="muted">Never</span>') },
        { key: 'x', label: '', nosort: true, render: (u) => `<div class="btn-group"><button class="btn xs" data-edit="${u.id}">Edit</button><button class="btn xs" data-perm="${u.id}">Permissions</button>${u.id !== state.user.id && u.status === 'Active' ? `<button class="btn xs ghost" data-dis="${u.id}">Disable</button>` : ''}</div>` },
      ],
    });
    const userModal = (u = null) => openModal({
      title: u ? `Edit ${u.full_name}` : 'Add user',
      body: formHtml([
        ...(u ? [] : [{ name: 'username', label: 'Username', required: true }]),
        { name: 'full_name', label: 'Full name', required: true }, { name: 'email', label: 'Email', type: 'email' },
        { name: 'role_id', label: 'Role', type: 'select', required: true, options: opt(rp.roles) },
        { name: 'status', label: 'Status', type: 'select', placeholder: false, options: opt(['Active', 'Disabled']) },
        { name: 'password', label: u ? 'Reset password (optional, min 8)' : 'Password (min 8 characters)', type: 'password', required: !u, span: 2 },
      ], u || { status: 'Active' }),
      onSubmit: async (f) => {
        const b = readForm(f);
        if (u) await api.put(`/users/${u.id}`, b); else await api.post('/users', b);
        await afterChange('User saved');
      },
    });
    on(el, 'click', '[data-new]', () => userModal());
    on(el, 'click', '[data-edit]', (_e, b) => userModal(users.find((u) => String(u.id) === b.dataset.edit)));
    on(el, 'click', '[data-dis]', async (_e, b) => {
      const u = users.find((x) => String(x.id) === b.dataset.dis);
      if (await confirmDialog('Disable user', `Disable <b>${esc(u.full_name)}</b>? They are signed out immediately; their history is kept.`, { confirmLabel: 'Disable' })) { await api.del(`/users/${u.id}`); await afterChange('User disabled'); }
    });
    on(el, 'click', '[data-perm]', async (_e, b) => {
      const u = users.find((x) => String(x.id) === b.dataset.perm);
      const p = await api.get(`/users/${u.id}/permissions`);
      const ov = Object.fromEntries(p.overrides.map((o) => [o.permission_key, o.granted]));
      const mods = [...new Set(rp.permissions.map((x) => x.module))];
      openModal({
        title: `Permissions — ${u.full_name} (${p.role})`,
        size: 'xl',
        body: `<p class="muted" style="margin-top:0">Each permission follows the role by default. Override individually to grant or deny for this user only.</p>
          <div class="perm-grid">${mods.map((m) => `<div class="mod">${esc(m)}</div>${rp.permissions.filter((x) => x.module === m).map((x) => {
          const def = p.role_permissions.includes(x.key);
          const cur = x.key in ov ? (ov[x.key] ? 'grant' : 'deny') : 'role';
          return `<label style="display:block"><span><b class="mono" style="font-size:12px">${esc(x.key)}</b><br><span class="cell-sub">${esc(x.description)}</span></span>
            <select data-pk="${esc(x.key)}" style="margin-top:4px;width:100%;height:30px;border-radius:6px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text)">
              <option value="role" ${cur === 'role' ? 'selected' : ''}>Role default (${def ? 'allowed' : 'denied'})</option>
              <option value="grant" ${cur === 'grant' ? 'selected' : ''}>Grant</option><option value="deny" ${cur === 'deny' ? 'selected' : ''}>Deny</option></select></label>`;
        }).join('')}`).join('')}</div>`,
        onSubmit: async (f) => {
          const overrides = [...f.querySelectorAll('[data-pk]')].filter((s) => s.value !== 'role').map((s) => ({ permission_key: s.dataset.pk, granted: s.value === 'grant' ? 1 : 0 }));
          await api.put(`/users/${u.id}/permissions`, { overrides });
          await afterChange('Permissions saved');
        },
      });
    });
  },
  async roles(el) {
    const rp = await api.get('/users/roles');
    const mods = [...new Set(rp.permissions.map((x) => x.module))];
    el.innerHTML = `<div class="stack">${rp.roles.map((r) => `<form class="card" data-role="${r.id}"><div class="card-head"><div><h3>${esc(r.name.toUpperCase())}</h3><div class="cell-sub">${esc(r.description || '')}</div></div>
      ${r.name === 'Admin' ? badge('Full access (locked)', 'blue') : '<button class="btn sm primary" type="submit">Save role</button>'}</div>
      <div class="card-body"><div class="perm-grid">${mods.map((m) => `<div class="mod">${esc(m)}</div>${rp.permissions.filter((x) => x.module === m).map((x) => `<label><input type="checkbox" value="${esc(x.key)}" ${r.permissions.includes(x.key) ? 'checked' : ''} ${r.name === 'Admin' ? 'disabled' : ''}>
        <span><b class="mono" style="font-size:12px">${esc(x.key)}</b><br><span class="cell-sub">${esc(x.description)}</span></span></label>`).join('')}`).join('')}</div></div></form>`).join('')}</div>`;
    on(el, 'submit', 'form[data-role]', async (e, f) => {
      e.preventDefault();
      const perms = [...f.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value);
      try { await api.put(`/users/roles/${f.dataset.role}`, { permissions: perms }); await afterChange('Role permissions saved'); } catch (ex) { toast(ex.message, 'err'); }
    });
  },
  async system(el) {
    el.innerHTML = `<div class="grid g2">${card('Your account', kv([['Name', esc(state.user.full_name)], ['Username', esc(state.user.username)], ['Role', badge(state.user.role)], ['Permissions', `${state.user.permissions.length}`]]))}
      ${card('Local development', `<p style="margin-top:0">This build runs fully offline on a local SQLite database.</p>${kv([
      ['Reset sample data', '<code>npm run db:reset</code>'], ['Database file', '<code>data/itms.db</code>'], ['Vault key', '<code>data/vault.key</code> (or ITMS_VAULT_KEY env)'], ['Uploads', '<code>data/uploads/</code>'],
      ['Monitoring', 'ISP / device statuses are manual. Fields <code>status_source</code> and <code>monitor_*</code> are reserved for future ping/SNMP.'],
    ])}`)}</div>`;
  },
};

async function lookupPane(el, path, label, columns, fields) {
  const rows = await api.get(`/settings/${path}`);
  el.innerHTML = `<section class="card"><div class="card-head"><h3>${label}s</h3><button class="btn sm primary" data-new>+ Add ${label.toLowerCase()}</button></div><div data-t></div></section>`;
  mountTable(el.querySelector('[data-t]'), {
    rows,
    columns: [...columns, { key: 'usage', label: 'Used by' }, { key: 'x', label: '', nosort: true, render: (r) => `<button class="btn xs" data-edit="${r.id}">Edit</button> ${r.usage ? '' : `<button class="btn xs ghost" data-del="${r.id}">Delete</button>`}` }],
  });
  const modal = (r = null) => openModal({
    title: r ? `Edit ${r.name}` : `Add ${label.toLowerCase()}`,
    body: formHtml(fields, r || {}),
    onSubmit: async (f) => {
      const b = readForm(f);
      if (r) await api.put(`/settings/${path}/${r.id}`, b); else await api.post(`/settings/${path}`, b);
      await afterChange(`${label} saved`);
    },
  });
  on(el, 'click', '[data-new]', () => modal());
  on(el, 'click', '[data-edit]', (_e, b) => modal(rows.find((r) => String(r.id) === b.dataset.edit)));
  on(el, 'click', '[data-del]', async (_e, b) => {
    if (await confirmDialog(`Delete ${label.toLowerCase()}`, 'Delete this entry?', { confirmLabel: 'Delete' })) { await api.del(`/settings/${path}/${b.dataset.del}`); await afterChange(`${label} deleted`); }
  });
}
