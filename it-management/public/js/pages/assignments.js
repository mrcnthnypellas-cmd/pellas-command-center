import { api, esc, badge, fmtDate, can, mountTable, filterBar, readFilters, qs, debounce, loadLookups, opt, formHtml, readForm, setTitle, on, state, today, toast } from '../core.js';
import { returnModal, transferModal, CONDITIONS } from './actions.js';

export async function list(el, _m, params) {
  setTitle('Assignments');
  el.innerHTML = `<div class="page-head"><div><h1>All Assignments</h1><p>Every deployment, current and past. Records are never deleted.</p></div>
    <div class="page-actions">${can('assets.assign') ? '<a class="btn primary" href="#/deploy">Deploy asset</a>' : ''}</div></div>
    <section class="card">${filterBar([
    { type: 'search', name: 'q', placeholder: 'Search asset tag, asset, employee…' },
    { name: 'status', label: 'All statuses', options: opt(['Active', 'Returned', 'Transferred']) },
  ], { status: 'Active', ...params })}<div data-t></div></section>`;
  const table = mountTable(el.querySelector('[data-t]'), {
    rows: [], rowHref: (x) => `#/assets/${x.asset_id}`,
    columns: [
      { key: 'asset_tag', label: 'Asset Tag', render: (x) => `<span class="mono t-strong">${esc(x.asset_tag)}</span>` }, { key: 'asset_name', label: 'Asset' }, { key: 'category', label: 'Category' },
      { key: 'employee_name', label: 'Employee', render: (x) => `<a href="#/employees/${x.employee_id}">${esc(x.employee_name)}</a>` },
      { key: 'department', label: 'Department' }, { key: 'location', label: 'Location' },
      { key: 'assigned_date', label: 'Assigned', render: (x) => fmtDate(x.assigned_date) },
      { key: 'ended_date', label: 'Ended', render: (x) => (x.ended_date ? fmtDate(x.ended_date) : '<span class="muted">—</span>') },
      { key: 'issued_by', label: 'Issued by' }, { key: 'status', label: 'Status', render: (x) => badge(x.status) },
    ],
  });
  const load = async () => { const f = readFilters(el); history.replaceState(null, '', `#/assignments${qs(f)}`); table.update(await api.get(`/assignments${qs(f)}`)); };
  el.querySelector('.filters').addEventListener('input', debounce(load));
  await load();
}

// Dedicated Deploy workflow page (inline, step by step).
export async function deploy(el, _m, params) {
  setTitle('Deploy Asset');
  const L = await loadLookups(true);
  const available = L.assets.filter((a) => a.status === 'Available');
  const employees = L.employees.filter((e) => e.status === 'Active');
  const recent = (await api.get('/assignments?status=Active')).slice(0, 8);
  const allowed = can('assets.assign');
  el.innerHTML = `<div class="page-head"><div><h1>Deploy Asset</h1><p>Issue equipment to an employee. The asset becomes <b>DEPLOYED</b> and shows on the employee profile immediately.</p></div></div>
  <div class="grid split-3-2">
    <form class="card" novalidate><div class="card-body">${allowed ? '' : '<div class="alert warn">Read-only: you need the <b>assets.assign</b> permission to deploy.</div>'}<div class="alert err hidden" data-err></div>${formHtml([
    { type: 'section', label: 'Step 1 · Select asset', help: `${available.length} available asset(s)` },
    { name: 'asset_id', label: 'Asset', type: 'select', required: true, span: 2, options: opt(available, 'id', (a) => `${a.asset_tag} — ${a.name}`), value: params.asset },
    { type: 'section', label: 'Step 2 · Select employee' },
    { name: 'employee_id', label: 'Employee', type: 'select', required: true, span: 2, options: opt(employees, 'id', (e) => `${e.full_name} (${e.employee_code})`), value: params.employee },
    { type: 'section', label: 'Step 3 · Department & location' },
    { name: 'department_id', label: 'Department', type: 'select', options: opt(L.departments) },
    { name: 'location_id', label: 'Location', type: 'select', options: opt(L.locations) },
    { type: 'section', label: 'Step 4 · Deployment details' },
    { name: 'assigned_date', label: 'Deployment date', type: 'date', value: today(), required: true },
    { name: 'condition_on_assign', label: 'Condition before deployment', type: 'select', options: opt(CONDITIONS), value: 'Good' },
    { name: 'issued_by', label: 'Issued by', value: state.user.full_name },
    { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
  ])}</div><div class="form-actions"><button class="btn primary" type="submit" ${allowed ? '' : 'disabled'}>Deploy asset</button></div></form>
    <section class="card"><div class="card-head"><h3>Recently deployed</h3><a href="#/assignments" class="muted">All</a></div><div class="card-body flush"><ul class="list">
      ${recent.map((r) => `<li><div class="grow"><a href="#/assets/${r.asset_id}" class="mono"><b>${esc(r.asset_tag)}</b></a> ${esc(r.asset_name)}<div class="meta">→ ${esc(r.employee_name)} · ${fmtDate(r.assigned_date)}</div></div></li>`).join('') || '<li class="muted">None</li>'}
    </ul></div></section></div>`;
  const f = el.querySelector('form');
  const sync = () => {
    const e = L.employees.find((x) => String(x.id) === f.employee_id.value);
    if (e) { f.department_id.value = e.department_id || ''; f.location_id.value = e.location_id || ''; }
  };
  f.employee_id.addEventListener('change', sync);
  sync();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = f.querySelector('[data-err]');
    err.classList.add('hidden');
    try {
      const r = await api.post('/assignments/deploy', readForm(f));
      toast(`${r.asset.asset_tag} deployed to ${r.asset.employee_name}`);
      await loadLookups(true);
      location.hash = `#/employees/${r.asset.employee_id}`;
    } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
  });
}

export async function returns(el) {
  setTitle('Returns');
  el.innerHTML = `<div class="page-head"><div><h1>Asset Returns</h1><p>Equipment handed back to IT, with condition and resulting status.</p></div>
    <div class="page-actions">${can('assets.assign') ? '<button class="btn primary" data-new>Return asset</button>' : ''}</div></div><section class="card" data-t></section>`;
  mountTable(el.querySelector('[data-t]'), {
    rows: await api.get('/assignments/returns'), rowHref: (x) => `#/assets/${x.asset_id}`, empty: 'No returns recorded',
    columns: [
      { key: 'return_date', label: 'Date', render: (x) => fmtDate(x.return_date) }, { key: 'asset_tag', label: 'Asset Tag', render: (x) => `<span class="mono t-strong">${esc(x.asset_tag)}</span>` },
      { key: 'asset_name', label: 'Asset' }, { key: 'employee_name', label: 'Returned by', render: (x) => `<a href="#/employees/${x.employee_id}">${esc(x.employee_name)}</a>` },
      { key: 'condition_on_return', label: 'Condition' }, { key: 'resulting_status', label: 'Status after', render: (x) => badge(x.resulting_status) },
      { key: 'received_by', label: 'Received by' }, { key: 'notes', label: 'Notes' },
      { key: 'photo_url', label: 'Photo', nosort: true, render: (x) => (x.photo_url ? `<a href="${esc(x.photo_url)}" target="_blank" rel="noopener">View</a>` : '') },
    ],
  });
  on(el, 'click', '[data-new]', () => returnModal());
}

export async function transfers(el) {
  setTitle('Transfers');
  el.innerHTML = `<div class="page-head"><div><h1>Asset Transfers</h1><p>Employee-to-employee handovers. Previous assignments stay in history.</p></div>
    <div class="page-actions">${can('assets.assign') ? '<button class="btn primary" data-new>Transfer asset</button>' : ''}</div></div><section class="card" data-t></section>`;
  mountTable(el.querySelector('[data-t]'), {
    rows: await api.get('/assignments/transfers'), rowHref: (x) => `#/assets/${x.asset_id}`, empty: 'No transfers recorded',
    columns: [
      { key: 'transfer_date', label: 'Date', render: (x) => fmtDate(x.transfer_date) }, { key: 'asset_tag', label: 'Asset Tag', render: (x) => `<span class="mono t-strong">${esc(x.asset_tag)}</span>` },
      { key: 'asset_name', label: 'Asset' },
      { key: 'from_employee', label: 'From', render: (x) => `<a href="#/employees/${x.from_employee_id}">${esc(x.from_employee)}</a>` },
      { key: 'to_employee', label: 'To', render: (x) => `<a href="#/employees/${x.to_employee_id}">${esc(x.to_employee)}</a>` },
      { key: 'reason', label: 'Reason' }, { key: 'approved_by', label: 'Approved by' }, { key: 'notes', label: 'Notes' },
    ],
  });
  on(el, 'click', '[data-new]', () => transferModal());
}
