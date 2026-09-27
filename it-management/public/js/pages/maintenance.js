import { api, esc, badge, fmtDate, money, can, mountTable, filterBar, readFilters, qs, debounce, setTitle, on, loadLookups, opt, openModal, formHtml, readForm, confirmDialog } from '../core.js';
import { maintenanceModal, MAINT_STATUSES, afterChange } from './actions.js';

export async function list(el, _m, params) {
  setTitle('Maintenance');
  await loadLookups();
  el.innerHTML = `<div class="page-head"><div><h1>Maintenance</h1><p>Repairs and servicing. An open record keeps the asset <b>UNDER REPAIR</b>.</p></div>
    <div class="page-actions">${can('maintenance.manage') ? '<button class="btn primary" data-new>+ Log maintenance</button>' : ''}</div></div>
    <section class="card">${filterBar([
    { type: 'search', name: 'q', placeholder: 'Search asset, issue, technician, vendor…' },
    { name: 'status', label: 'All statuses', options: [{ value: 'active', label: 'Open (not completed)' }, ...opt(MAINT_STATUSES)] },
  ], params)}<div data-t></div></section>`;
  let rows = [];
  const table = mountTable(el.querySelector('[data-t]'), {
    rows,
    columns: [
      { key: 'asset_tag', label: 'Asset', render: (m) => `<a class="mono t-strong" href="#/assets/${m.asset_id}">${esc(m.asset_tag)}</a><div class="cell-sub">${esc(m.asset_name)}</div>` },
      { key: 'issue', label: 'Issue', render: (m) => `<b>${esc(m.issue)}</b>${m.notes ? `<div class="cell-sub">${esc(m.notes)}</div>` : ''}` },
      { key: 'reported_date', label: 'Reported', render: (m) => fmtDate(m.reported_date) },
      { key: 'repair_start', label: 'Repair start', render: (m) => fmtDate(m.repair_start) },
      { key: 'repair_end', label: 'Repair end', render: (m) => fmtDate(m.repair_end) },
      { key: 'technician', label: 'Technician' }, { key: 'vendor', label: 'Vendor' },
      { key: 'repair_cost', label: 'Cost', render: (m) => money(m.repair_cost), sort: (m) => m.repair_cost },
      { key: 'parts_replaced', label: 'Parts replaced' },
      { key: 'status', label: 'Status', render: (m) => badge(m.status) },
      { key: 'x', label: '', nosort: true, render: (m) => (can('maintenance.manage') ? `<button class="btn xs" data-edit="${m.id}">Update</button> <button class="btn xs ghost" data-del="${m.id}">Delete</button>` : '') },
    ],
  });
  const load = async () => { const f = readFilters(el); history.replaceState(null, '', `#/maintenance${qs(f)}`); rows = await api.get(`/maintenance${qs(f)}`); table.update(rows); };
  el.querySelector('.filters').addEventListener('input', debounce(load));
  on(el, 'click', '[data-new]', () => maintenanceModal());
  on(el, 'click', '[data-edit]', (_e, b) => maintenanceModal({ record: rows.find((m) => String(m.id) === b.dataset.edit) }));
  on(el, 'click', '[data-del]', async (_e, b) => {
    if (await confirmDialog('Delete record', 'Delete this maintenance record? The asset status will be re-evaluated.', { confirmLabel: 'Delete' })) {
      await api.del(`/maintenance/${b.dataset.del}`); await afterChange('Record deleted');
    }
  });
  await load();
}

export async function warranty(el, _m, params) {
  setTitle('Warranty');
  const L = await loadLookups();
  const filter = params.filter || 'all';
  const days = params.days || '30';
  el.innerHTML = `<div class="page-head"><div><h1>Warranty</h1><p>Active, expiring and expired warranty coverage.</p></div>
    <div class="page-actions">${can('maintenance.manage') ? '<button class="btn primary" data-new>+ Add warranty</button>' : ''}${can('reports.export') ? '<a class="btn needs-pdf" href="/api/reports/warranty?format=pdf">PDF</a><a class="btn only-no-pdf" href="/api/reports/warranty?format=csv">CSV</a>' : ''}</div></div>
    <div class="stats" data-stats style="margin-bottom:16px"></div>
    <section class="card"><div class="filters" style="align-items:center">
      <div class="pill-tabs" data-f>${[['all', 'All'], ['active', 'Active'], ['expiring', 'Expiring soon'], ['expired', 'Expired'], ['none', 'No warranty']].map(([k, l]) => `<button data-v="${k}" class="${k === filter ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="pill-tabs" data-d>${['30', '60', '90'].map((d) => `<button data-v="${d}" class="${d === days ? 'active' : ''}">${d} days</button>`).join('')}</div>
      <span class="muted">“Expiring soon” window</span></div><div data-t></div></section>`;
  const all = await api.get('/maintenance/warranty/list');
  const table = mountTable(el.querySelector('[data-t]'), {
    rows: [], rowHref: (a) => `#/assets/${a.id}`,
    columns: [
      { key: 'asset_tag', label: 'Asset Tag', render: (a) => `<span class="mono t-strong">${esc(a.asset_tag)}</span>` }, { key: 'name', label: 'Asset' },
      { key: 'category', label: 'Category' }, { key: 'employee_name', label: 'Assigned To' },
      { key: 'warranty_provider', label: 'Provider' }, { key: 'warranty_start', label: 'Start', render: (a) => fmtDate(a.warranty_start) },
      { key: 'warranty_end', label: 'Expires', render: (a) => fmtDate(a.warranty_end) },
      { key: 'days_left', label: 'Days left', render: (a) => (a.days_left === null ? '<span class="muted">—</span>' : a.days_left < 0 ? `<span style="color:var(--red)">${-a.days_left} days ago</span>` : `<b>${a.days_left}</b>`) },
      { key: 'ws', label: 'Status', sort: (a) => a.days_left, render: (a) => badge(a.ws) },
    ],
  });
  const draw = () => {
    const f = el.querySelector('[data-f] .active').dataset.v;
    const d = Number(el.querySelector('[data-d] .active').dataset.v);
    all.forEach((a) => { a.ws = a.days_left === null ? 'None' : a.days_left < 0 ? 'Expired' : a.days_left <= d ? 'Expiring Soon' : 'Active'; });
    const counts = { active: all.filter((a) => a.ws === 'Active' || a.ws === 'Expiring Soon').length, expiring: all.filter((a) => a.ws === 'Expiring Soon').length, expired: all.filter((a) => a.ws === 'Expired').length, none: all.filter((a) => a.ws === 'None').length };
    el.querySelector('[data-stats]').innerHTML = `<div class="stat"><div class="label">Active warranty</div><div class="value">${counts.active}</div></div>
      <div class="stat ${counts.expiring ? 'alert-on' : ''}"><div class="label">Expiring within ${d} days</div><div class="value">${counts.expiring}</div></div>
      <div class="stat"><div class="label">Expired</div><div class="value">${counts.expired}</div></div><div class="stat"><div class="label">No warranty on file</div><div class="value">${counts.none}</div></div>`;
    const rows = all.filter((a) => (f === 'all' ? true : f === 'active' ? ['Active', 'Expiring Soon'].includes(a.ws) : f === 'expiring' ? a.ws === 'Expiring Soon' : f === 'expired' ? a.ws === 'Expired' : a.ws === 'None'));
    history.replaceState(null, '', `#/warranty${qs({ filter: f === 'all' ? '' : f, days: d })}`);
    table.update(rows);
  };
  on(el, 'click', '.pill-tabs button', (_e, b) => { b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); draw(); });
  on(el, 'click', '[data-new]', () => openModal({
    title: 'Add warranty record',
    body: formHtml([
      { name: 'asset_id', label: 'Asset', type: 'select', required: true, span: 2, options: opt(L.assets, 'id', (a) => `${a.asset_tag} — ${a.name}`) },
      { name: 'warranty_type', label: 'Type', type: 'select', placeholder: false, options: opt(['Manufacturer', 'Extended', 'Vendor', 'Accidental Damage']) },
      { name: 'provider', label: 'Provider' }, { name: 'start_date', label: 'Start', type: 'date' }, { name: 'end_date', label: 'Expiration', type: 'date', required: true },
      { name: 'reference_no', label: 'Reference / contract no.' }, { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ]),
    onSubmit: async (f) => { await api.post('/maintenance/warranty', readForm(f)); await afterChange('Warranty added'); },
  }));
  draw();
}
