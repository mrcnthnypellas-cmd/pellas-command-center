import {
  api, esc, badge, fmtDate, can, mountTable, filterBar, readFilters, qs, debounce, loadLookups, opt, formHtml, formData,
  openModal, setTitle, on, card, confirmDialog, toast,
} from '../core.js';
import { deployModal, returnModal, transferModal, afterChange } from './actions.js';

const STATUSES = ['Active', 'On Leave', 'Inactive', 'Resigned'];
const initials = (n) => n.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
const avatar = (e, cls = '') => `<div class="avatar ${cls}">${e.photo_url ? `<img src="${esc(e.photo_url)}" alt="">` : esc(initials(e.full_name))}</div>`;

export async function employeeModal(e = null) {
  const L = await loadLookups();
  const code = e ? e.employee_code : (await api.get('/employees/next-code')).code;
  openModal({
    title: e ? `Edit ${e.full_name}` : 'Add employee',
    size: 'lg',
    body: formHtml([
      { name: 'employee_code', label: 'Employee ID', required: true, value: code },
      { name: 'full_name', label: 'Full name', required: true },
      { name: 'position', label: 'Position' },
      { name: 'department_id', label: 'Department', type: 'select', options: opt(L.departments) },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'contact_number', label: 'Contact number' },
      { name: 'location_id', label: 'Office / location', type: 'select', options: opt(L.locations) },
      { name: 'status', label: 'Status', type: 'select', placeholder: false, options: opt(STATUSES), value: 'Active' },
      { name: 'photo', label: 'Profile photo', type: 'file', span: 2 },
    ], e || {}),
    onSubmit: async (form) => {
      const saved = await api.form(e ? 'PUT' : 'POST', e ? `/employees/${e.id}` : '/employees', formData(form));
      await afterChange(e ? 'Employee updated' : `Employee ${saved.full_name} added`);
      if (!e) location.hash = `#/employees/${saved.id}`;
    },
  });
}

export async function list(el, _m, params) {
  setTitle('Employees');
  const L = await loadLookups();
  el.innerHTML = `<div class="page-head"><div><h1>Employees</h1><p>Who is accountable for which equipment.</p></div>
    <div class="page-actions">${can('employees.manage') ? '<button class="btn primary" data-add>+ Add employee</button>' : ''}</div></div>
    <section class="card">${filterBar([
    { type: 'search', name: 'q', placeholder: 'Search name, employee ID, email, position…' },
    { name: 'department_id', label: 'All departments', options: opt(L.departments) },
    { name: 'status', label: 'All statuses', options: opt(STATUSES) },
    { name: 'has_assets', label: 'With / without assets', options: [{ value: '1', label: 'With assigned assets' }, { value: '0', label: 'Without assigned assets' }] },
  ], params)}<div data-t></div></section>`;
  const table = mountTable(el.querySelector('[data-t]'), {
    rows: [],
    rowHref: (e) => `#/employees/${e.id}`,
    columns: [
      { key: 'full_name', label: 'Employee', render: (e) => `<div style="display:flex;gap:10px;align-items:center">${avatar(e)}<div><b>${esc(e.full_name)}</b><div class="cell-sub">${esc(e.email || '')}</div></div></div>` },
      { key: 'employee_code', label: 'Employee ID', render: (e) => `<span class="mono">${esc(e.employee_code)}</span>` },
      { key: 'position', label: 'Position' }, { key: 'department', label: 'Department' }, { key: 'location', label: 'Office' },
      { key: 'contact_number', label: 'Contact' },
      { key: 'asset_count', label: 'Assets', render: (e) => (e.asset_count ? `<b>${e.asset_count}</b>` : '<span class="muted">0</span>') },
      { key: 'status', label: 'Status', render: (e) => badge(e.status) },
    ],
  });
  const load = async () => {
    const f = readFilters(el);
    history.replaceState(null, '', `#/employees${qs(f)}`);
    table.update(await api.get(`/employees${qs(f)}`));
  };
  el.querySelector('.filters').addEventListener('input', debounce(load));
  on(el, 'click', '[data-add]', () => employeeModal());
  await load();
}

export async function profile(el, [id]) {
  const e = await api.get(`/employees/${id}`);
  setTitle(e.full_name);
  el.innerHTML = `<div class="crumbs"><a href="#/employees">Employees</a> / ${esc(e.employee_code)}</div>
  <section class="card" style="margin-bottom:16px"><div class="profile-head">${avatar(e, 'lg')}
    <div style="flex:1"><h1>${esc(e.full_name)}</h1><div class="profile-meta"><span class="mono">${esc(e.employee_code)}</span> · ${esc(e.position || '')} · ${esc(e.department || 'No department')} ${badge(e.status)}</div></div>
    <div class="page-actions no-print">
      ${can('assets.assign') && e.status === 'Active' ? '<button class="btn primary" data-do="deploy">Deploy asset</button>' : ''}
      ${can('assets.assign') && e.assets.length ? '<button class="btn" data-do="return">Return asset</button>' : ''}
      <a class="btn" href="#/print/accountability/${e.id}">Print accountability form</a>
      ${can('employees.manage') ? '<button class="btn" data-do="edit">Edit</button>' : ''}
      ${can('employees.manage') && !e.assignment_history.length ? '<button class="btn ghost" data-do="delete">Delete</button>' : ''}
    </div></div>
    <div class="facts"><div><small>Email</small><b>${esc(e.email || '—')}</b></div><div><small>Contact</small><b>${esc(e.contact_number || '—')}</b></div>
      <div><small>Office / Location</small><b>${esc(e.location || '—')}</b></div><div><small>Department</small><b>${esc(e.department || '—')}</b></div>
      <div><small>Total Assigned Assets</small><b style="font-size:20px">${e.assets.length}</b></div></div></section>
  <div class="grid split-3-2">
    <section class="card"><div class="card-head"><h3>Assigned assets</h3><span class="muted">Total assigned: <b>${e.assets.length}</b></span></div><div class="card-body flush">
      ${e.assets.length ? `<ul class="list">${e.assets.map((a) => `<li><div class="grow"><div class="cell-sub" style="text-transform:uppercase;letter-spacing:.05em;font-weight:600">${esc(a.category)}</div>
        <a href="#/assets/${a.id}"><b>${esc(a.name)}</b></a><div class="meta"><span class="mono">${esc(a.asset_tag)}</span>${a.serial_number ? ` · S/N ${esc(a.serial_number)}` : ''}${a.ip_address ? ` · IP <span class="mono">${esc(a.ip_address)}</span>` : ''} · since ${fmtDate(a.assigned_date)}</div></div>
        ${badge(a.status)}${can('assets.assign') ? `<div class="btn-group"><button class="btn xs" data-tr="${a.id}">Transfer</button><button class="btn xs" data-rt="${a.id}">Return</button></div>` : ''}</li>`).join('')}</ul>`
    : '<div class="empty-state">No assets currently assigned</div>'}</div></section>
    ${card('Returns & transfers', e.returns.length || e.transfers.length ? `<ul class="timeline">${[
    ...e.returns.map((r) => ({ d: r.return_date, t: 'Returned', s: `${r.asset_tag} ${r.asset_name} — ${r.condition_on_return || ''} → ${r.resulting_status}` })),
    ...e.transfers.map((t) => ({ d: t.transfer_date, t: 'Transferred', s: `${t.asset_tag}: ${t.from_employee} → ${t.to_employee}${t.reason ? ` (${t.reason})` : ''}` })),
  ].sort((a, b) => (a.d < b.d ? 1 : -1)).map((x) => `<li><span class="tl-dot violet"></span><div class="tl-date">${fmtDate(x.d, true)}</div><div class="tl-title">${x.t}</div><div class="tl-desc">${esc(x.s)}</div></li>`).join('')}</ul>` : '<div class="empty-state">None</div>')}
  </div>
  <section class="card" style="margin-top:16px"><div class="card-head"><h3>Assignment history</h3><span class="muted">all past and current assignments</span></div><div class="card-body flush" data-hist></div></section>`;
  mountTable(el.querySelector('[data-hist]'), {
    rows: e.assignment_history, empty: 'No assignments yet', rowHref: (x) => `#/assets/${x.asset_id}`,
    columns: [
      { key: 'asset_tag', label: 'Asset Tag', render: (x) => `<span class="mono">${esc(x.asset_tag)}</span>` }, { key: 'asset_name', label: 'Asset' }, { key: 'category', label: 'Category' },
      { key: 'assigned_date', label: 'Assigned', render: (x) => fmtDate(x.assigned_date) }, { key: 'ended_date', label: 'Ended', render: (x) => (x.ended_date ? fmtDate(x.ended_date) : '<span class="muted">present</span>') },
      { key: 'condition_on_assign', label: 'Condition' }, { key: 'status', label: 'Status', render: (x) => badge(x.status) },
    ],
  });
  on(el, 'click', '[data-do]', async (_ev, b) => {
    const k = b.dataset.do;
    if (k === 'deploy') deployModal({ employeeId: e.id });
    if (k === 'return') returnModal({ employeeId: e.id });
    if (k === 'edit') employeeModal(e);
    if (k === 'delete' && await confirmDialog('Delete employee', `Delete <b>${esc(e.full_name)}</b>? Only possible when there is no assignment history.`, { confirmLabel: 'Delete' })) {
      await api.del(`/employees/${e.id}`); toast('Employee deleted'); await loadLookups(true); location.hash = '#/employees';
    }
  });
  on(el, 'click', '[data-tr]', (_ev, b) => transferModal({ assetId: b.dataset.tr }));
  on(el, 'click', '[data-rt]', (_ev, b) => returnModal({ assetId: b.dataset.rt, employeeId: e.id }));
}
