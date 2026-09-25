import {
  api, esc, dash, badge, fmtDate, money, can, mountTable, filterBar, readFilters, qs, debounce, loadLookups, opt, formHtml,
  formData, toast, card, kv, openModal, readForm, confirmDialog, setTitle, fmtDateTime, on, daysLeft,
} from '../core.js';
import { icon } from '../icons.js';
import { deployModal, returnModal, transferModal, maintenanceModal, retireModal, ipModal, uploadDocModal, afterChange } from './actions.js';

export const ASSET_STATUSES = ['Available', 'Deployed', 'Under Repair', 'Damaged', 'Lost', 'Retired', 'Disposed'];

function warrantyBadge(a) {
  if (!a.warranty_end) return '<span class="muted">—</span>';
  const d = daysLeft(a.warranty_end);
  return `${badge(a.warranty_status === 'Active' ? 'Active' : a.warranty_status)}<div class="cell-sub">${d < 0 ? 'ended' : 'until'} ${fmtDate(a.warranty_end)}</div>`;
}

// Row action menu used in the asset table and elsewhere.
export function assetActions(a) {
  const items = [['view', 'View'], ['label', 'Print QR label']];
  if (can('assets.edit')) items.push(['edit', 'Edit']);
  if (can('assets.assign')) {
    if (a.status === 'Available') items.push(['assign', 'Assign / Deploy']);
    if (a.employee_id) items.push(['transfer', 'Transfer'], ['return', 'Return']);
  }
  if (can('maintenance.manage') && !['Retired', 'Disposed'].includes(a.status)) items.push(['maint', 'Maintenance']);
  if (can('assets.retire') && !['Retired', 'Disposed'].includes(a.status)) items.push(['retire', 'Retire']);
  return `<div class="row-actions" style="position:relative;display:inline-block"><button class="btn xs" data-menu="${a.id}">Actions ▾</button>
    <div class="dropdown hidden" style="top:30px;min-width:170px">${items.map(([k, l]) => `<button data-act="${k}" data-id="${a.id}">${l}</button>`).join('')}</div></div>`;
}

export function bindAssetActions(root, getAsset) {
  on(root, 'click', '[data-menu]', (e, btn) => {
    e.stopPropagation();
    const dd = btn.nextElementSibling;
    const open = !dd.classList.contains('hidden');
    root.querySelectorAll('.row-actions .dropdown').forEach((x) => x.classList.add('hidden'));
    if (!open) dd.classList.remove('hidden');
  });
  on(root, 'click', '[data-act]', async (e, b) => {
    e.stopPropagation();
    b.closest('.dropdown')?.classList.add('hidden');
    const a = getAsset(b.dataset.id);
    const k = b.dataset.act;
    if (k === 'view') location.hash = `#/assets/${a.id}`;
    if (k === 'edit') location.hash = `#/assets/${a.id}/edit`;
    if (k === 'label') location.hash = `#/print/labels?ids=${a.id}`;
    if (k === 'assign') deployModal({ assetId: a.id });
    if (k === 'transfer') transferModal({ assetId: a.id });
    if (k === 'return') returnModal({ assetId: a.id });
    if (k === 'maint') maintenanceModal({ assetId: a.id });
    if (k === 'retire') retireModal(a);
  });
}

// ───────── List ─────────
export async function list(el, _m, params) {
  setTitle('Assets');
  const L = await loadLookups();
  el.innerHTML = `<div class="page-head"><div><h1>All Assets</h1><p>Every IT asset, who has it, where it is and what IP it uses.</p></div>
    <div class="page-actions"><a class="btn" href="#/print/labels" title="Print QR stickers for assets">${icon('qr').replace('<svg', '<svg width="15" height="15"')} Print QR labels</a>
    ${can('assets.create') || can('assets.edit') ? `<a class="btn" href="#/assets/import">${icon('upload').replace('<svg', '<svg width="15" height="15"')} Import</a>` : ''}
    ${can('reports.export') ? `<a class="btn" data-export href="/api/assets/export">${icon('download').replace('<svg', '<svg width="15" height="15"')} Export to Excel</a>` : ''}
    ${can('assets.create') ? '<a class="btn primary" href="#/assets/new">+ Add Asset</a>' : ''}</div></div>
    <section class="card">${filterBar([
    { type: 'search', name: 'q', placeholder: 'Search tag, name, serial, brand, employee, IP…' },
    { name: 'status', label: 'All statuses', options: opt(ASSET_STATUSES) },
    { name: 'category_id', label: 'All categories', options: opt(L.categories) },
    { name: 'department_id', label: 'All departments', options: opt(L.departments) },
    { name: 'location_id', label: 'All locations', options: opt(L.locations) },
    { name: 'warranty', label: 'Any warranty', options: opt(['Active', 'Expiring Soon', 'Expired', 'None']) },
  ], params)}<div data-table></div></section>`;
  let rows = [];
  const table = mountTable(el.querySelector('[data-table]'), {
    rows,
    rowHref: (a) => `#/assets/${a.id}`,
    columns: [
      { key: 'asset_tag', label: 'Asset Tag', render: (a) => `<a class="t-strong mono" href="#/assets/${a.id}">${esc(a.asset_tag)}</a>` },
      { key: 'name', label: 'Asset Name', render: (a) => `<b>${esc(a.name)}</b>` },
      { key: 'category', label: 'Category' },
      { key: 'brand', label: 'Brand' },
      { key: 'model', label: 'Model' },
      { key: 'serial_number', label: 'Serial Number', render: (a) => `<span class="mono">${dash(a.serial_number)}</span>` },
      { key: 'employee_name', label: 'Assigned To', render: (a) => (a.employee_id ? `<a href="#/employees/${a.employee_id}">${esc(a.employee_name)}</a>` : '<span class="muted">—</span>') },
      { key: 'department', label: 'Department' },
      { key: 'location', label: 'Location' },
      { key: 'ip_address', label: 'IP Address', render: (a) => `<span class="mono">${dash(a.ip_address)}</span>` },
      { key: 'status', label: 'Status', render: (a) => badge(a.status) },
      { key: 'purchase_date', label: 'Purchase Date', render: (a) => `<span class="nowrap">${fmtDate(a.purchase_date)}</span>` },
      { key: 'warranty_end', label: 'Warranty', render: warrantyBadge },
      { key: 'actions', label: 'Actions', nosort: true, render: assetActions },
    ],
  });
  bindAssetActions(el, (id) => rows.find((a) => String(a.id) === String(id)));
  const load = async () => {
    const f = readFilters(el);
    history.replaceState(null, '', `#/assets${qs(f)}`);
    el.querySelector('[data-export]')?.setAttribute('href', `/api/assets/export${qs(f)}`); // export what is filtered
    rows = await api.get(`/assets${qs(f)}`);
    table.update(rows);
  };
  el.querySelector('.filters').addEventListener('input', debounce(load, 250));
  await load();
}

// ───────── Add / Edit form ─────────
export async function form(el, [idOrTag]) {
  const L = await loadLookups();
  const editing = !!idOrTag;
  const a = editing ? await api.get(`/assets/${encodeURIComponent(idOrTag)}`) : { status: 'Available' };
  setTitle(editing ? `Edit ${a.asset_tag}` : 'Add Asset');
  const statusOpts = editing && a.status === 'Deployed' ? ['Deployed', 'Under Repair', 'Damaged', 'Lost'] : ASSET_STATUSES.filter((s) => s !== 'Deployed');
  el.innerHTML = `<div class="page-head"><div><div class="crumbs"><a href="#/assets">Assets</a> / ${editing ? esc(a.asset_tag) : 'New'}</div><h1>${editing ? `Edit ${esc(a.name)}` : 'Add Asset'}</h1>
    <p>${editing ? 'Update the asset record. Changes are logged in history.' : 'Leave the asset tag blank to auto-generate it from the category (e.g. LAP-0001).'}</p></div></div>
    <form class="card page-form" novalidate><div class="card-body"><div class="alert err hidden" data-err></div>${formHtml([
    { type: 'section', label: 'Basic information' },
    { name: 'category_id', label: 'Category', type: 'select', required: true, options: opt(L.categories, 'id', (c) => `${c.name} (${c.prefix})`) },
    { name: 'asset_tag', label: 'Asset tag', placeholder: 'Auto-generated', help: 'Auto-generated from the category prefix if left blank' },
    { name: 'name', label: 'Asset name', required: true, placeholder: 'e.g. Dell Latitude 5440' },
    { name: 'brand', label: 'Brand' },
    { name: 'model', label: 'Model' },
    { name: 'serial_number', label: 'Serial number' },
    { name: 'service_tag', label: 'Service tag' },
    { name: 'photo', label: 'Asset photo', type: 'file', help: a.photo_url ? 'Uploading replaces the current photo' : 'JPG/PNG/WebP' },
    { name: 'description', label: 'Description / specs', type: 'textarea', span: 2 },
    { type: 'section', label: 'Purchase information' },
    { name: 'supplier', label: 'Supplier' },
    { name: 'purchase_date', label: 'Purchase date', type: 'date' },
    { name: 'purchase_cost', label: `Purchase cost (${L.currency})`, type: 'number', step: '0.01' },
    { name: 'po_number', label: 'PO number' },
    { name: 'invoice_number', label: 'Invoice number' },
    { type: 'section', label: 'Warranty' },
    { name: 'warranty_start', label: 'Warranty start', type: 'date' },
    { name: 'warranty_end', label: 'Warranty expiration', type: 'date' },
    { type: 'section', label: 'Location', help: 'Building / floor / room come from the location record (Settings → Locations).' },
    { name: 'location_id', label: 'Building · Floor · Room', type: 'select', options: opt(L.locations, 'id', (l) => l.name) },
    { name: 'current_location', label: 'Current location detail', placeholder: 'e.g. Desk 14, Rack A — U10' },
    { name: 'department_id', label: 'Owning department', type: 'select', options: opt(L.departments) },
    { type: 'section', label: 'Network (optional)', help: 'Assign IP addresses from the asset profile → Network tab or the IP module.' },
    { name: 'mac_address', label: 'MAC address', placeholder: 'AA:BB:CC:DD:EE:FF' },
    { name: 'connected_device_id', label: 'Connected to (switch / AP)', type: 'select', options: opt(L.devices, 'id', (d) => `${d.name} (${d.device_type})`) },
    { type: 'section', label: 'Status & notes' },
    { name: 'status', label: 'Status', type: 'select', placeholder: false, options: opt(statusOpts), help: editing && a.status === 'Deployed' ? 'Use Return / Transfer to change who holds it' : 'Deploy to an employee with the Deploy workflow' },
    { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ...(!editing ? [{ type: 'section', label: 'Documents' }, { name: 'doc_type', label: 'Document type', type: 'select', placeholder: false, options: opt(['Receipt', 'Invoice', 'Warranty', 'Other']) },
      { name: 'document', label: 'Attach document (optional)', type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt' }] : []),
  ], a)}</div><div class="form-actions"><a class="btn ghost" href="${editing ? `#/assets/${a.id}` : '#/assets'}">Cancel</a><button class="btn primary" type="submit">${editing ? 'Save changes' : 'Create asset'}</button></div></form>`;

  const f = el.querySelector('form');
  const tagInput = f.asset_tag;
  f.category_id.addEventListener('change', async () => {
    if (editing || !f.category_id.value) return;
    const { tag } = await api.get(`/assets/next-tag?category_id=${f.category_id.value}`);
    tagInput.placeholder = `Auto: ${tag}`;
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = f.querySelector('[data-err]');
    err.classList.add('hidden');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (!f.elements.name.value.trim() || !f.category_id.value) throw new Error('Asset name and category are required');
      const fd = formData(f);
      const doc = fd.get('document');
      fd.delete('document'); fd.delete('doc_type');
      const saved = await api.form(editing ? 'PUT' : 'POST', editing ? `/assets/${a.id}` : '/assets', fd);
      if (doc && doc.size) {
        const d = new FormData();
        d.append('file', doc); d.append('entity_type', 'asset'); d.append('entity_id', saved.id); d.append('doc_type', f.doc_type.value);
        await api.form('POST', '/documents', d);
      }
      toast(editing ? 'Asset updated' : `Asset ${saved.asset_tag} created`);
      await loadLookups(true);
      location.hash = `#/assets/${saved.id}`;
    } catch (ex) {
      err.textContent = ex.message; err.classList.remove('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { btn.disabled = false; }
  });
}

// ───────── Profile ─────────
const TL_TONE = { Purchased: 'teal', Created: 'teal', Assigned: '', Transferred: 'violet', Returned: 'gray', Maintenance: 'amber', 'Repair Completed': 'green', Retired: 'red', Disposed: 'red', Audit: 'violet', 'Status Changed': 'amber', Network: 'teal', Warranty: 'teal' };
export const timeline = (items) => (items.length ? `<ul class="timeline">${items.map((h) => `<li><span class="tl-dot ${TL_TONE[h.event_type] ?? ''}"></span>
  <div class="tl-date">${fmtDate(h.event_date, true)}</div><div class="tl-title">${esc(h.event_type)}</div><div class="tl-desc">${esc(h.description)}</div>
  ${h.user_name ? `<div class="cell-sub">by ${esc(h.user_name)}</div>` : ''}</li>`).join('')}</ul>` : '<div class="empty-state">No history yet</div>');

export function relationshipHtml(r) {
  const node = (kind, body, href) => `<div class="chain-node ${body ? '' : 'missing'}"><span class="kind">${kind}</span><div>${body ? (href ? `<a href="${href}">${body}</a>` : body) : '<span class="muted">Not linked</span>'}</div></div>`;
  const arrow = '<div class="chain-arrow">↓</div>';
  const parts = [
    node('Employee', r.employee && `<b>${esc(r.employee.name)}</b> <span class="muted">${esc(r.employee.code)} · ${esc(r.employee.department || '')}</span>`, r.employee && `#/employees/${r.employee.id}`),
    node('Asset', `<b>${esc(r.asset.name)}</b> <span class="mono">${esc(r.asset.tag)}</span>`, `#/assets/${r.asset.id}`),
    node('Location', r.location && esc(r.location)),
    node('IP', r.ip && `<span class="mono"><b>${esc(r.ip.address)}</b></span> <span class="muted">${esc(r.ip.type)}${r.ip.mac ? ` · ${esc(r.ip.mac)}` : ''}</span>`, r.ip && '#/ips'),
    node('Network', r.network && `<b>${esc(r.network.name)}</b> <span class="mono muted">${esc(r.network.cidr)}</span>`, r.network && `#/networks/${r.network.id}`),
    ...r.devices.map((d) => node(d.device_type, `<b>${esc(d.name)}</b> <span class="mono muted">${esc(d.asset_tag || '')} ${esc(d.ip_address || '')}</span>`, `#/devices/${d.id}`)),
    node('ISP', r.isp && `<b>${esc(r.isp.provider_name)}</b> <span class="muted">${esc(r.isp.role)} · ${esc(r.isp.status)}</span>`, r.isp && '#/isps'),
  ];
  return `<div class="chain">${parts.join(arrow)}</div>`;
}

export async function profile(el, [idOrTag], params) {
  const a = await api.get(`/assets/${encodeURIComponent(idOrTag)}`);
  setTitle(a.asset_tag);
  const tab = params.tab || 'overview';
  const act = (k, label, cls = '') => `<button class="btn ${cls}" data-do="${k}">${label}</button>`;
  const actions = [
    can('assets.assign') && a.status === 'Available' && act('assign', 'Assign / Deploy', 'primary'),
    can('assets.assign') && a.employee_id && act('transfer', 'Transfer'),
    can('assets.assign') && a.employee_id && act('return', 'Return'),
    can('maintenance.manage') && !['Retired', 'Disposed'].includes(a.status) && act('maint', 'Maintenance'),
    can('assets.edit') && `<a class="btn" href="#/assets/${a.id}/edit">Edit</a>`,
    can('assets.retire') && !['Retired', 'Disposed'].includes(a.status) && act('retire', 'Retire'),
    can('assets.retire') && !a.assignments.length && act('delete', 'Delete', 'ghost'),
  ].filter(Boolean).join('');
  const primaryIp = a.ips[0];
  el.innerHTML = `<div class="crumbs"><a href="#/assets">Assets</a> / ${esc(a.asset_tag)}</div>
  <section class="card" style="margin-bottom:16px">
    <div class="profile-head"><div class="asset-photo">${a.photo_url ? `<img src="${esc(a.photo_url)}" alt="">` : icon('laptop')}</div>
      <div style="flex:1;min-width:0"><h1>${esc(a.name.toUpperCase())}</h1>
        <div class="profile-meta"><span class="mono"><b>${esc(a.asset_tag)}</b></span> · ${esc(a.category)} ${a.brand ? `· ${esc(a.brand)} ${esc(a.model || '')}` : ''} ${badge(a.status)}</div></div>
      <div class="page-actions no-print">${actions}</div></div>
    <div class="facts">
      <div><small>Asset Tag</small><b class="mono">${esc(a.asset_tag)}</b></div>
      <div><small>Serial Number</small><b class="mono">${dash(a.serial_number)}</b></div>
      <div><small>Status</small>${badge(a.status)}</div>
      <div><small>Assigned To</small>${a.employee_id ? `<a href="#/employees/${a.employee_id}"><b>${esc(a.employee_name)}</b></a>` : '<span class="muted">—</span>'}</div>
      <div><small>Department</small><b>${dash(a.department)}</b></div>
      <div><small>Location</small><b>${dash(a.location)}</b>${a.current_location ? `<div class="cell-sub">${esc(a.current_location)}</div>` : ''}</div>
      <div><small>IP</small><b class="mono">${dash(a.ip_address)}</b></div>
      <div><small>Purchase Date</small><b>${fmtDate(a.purchase_date, true)}</b></div>
      <div><small>Warranty</small>${a.warranty_end ? `${badge(a.warranty_status)} <span class="cell-sub">${fmtDate(a.warranty_end)}</span>` : '<span class="muted">None</span>'}</div>
    </div></section>
  <div class="tabs">${[['overview', 'Overview'], ['assignment', 'Assignment'], ['history', `History (${a.history.length})`], ['maintenance', `Maintenance (${a.maintenance.length})`], ['network', 'Network'], ['documents', `Documents (${a.documents.length})`]]
    .map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>
  <div data-pane></div>`;

  const pane = el.querySelector('[data-pane]');
  const panes = {
    overview: () => `<div class="grid split-2-1">
      <div class="stack">${card('Basic information', kv([
        ['Asset name', esc(a.name)], ['Category', esc(a.category)], ['Brand', esc(a.brand)], ['Model', esc(a.model)], ['Serial number', `<span class="mono">${esc(a.serial_number || '')}</span>`],
        ['Service tag', esc(a.service_tag)], ['Description', esc(a.description)], ['Notes', esc(a.notes)],
      ]))}
      ${card('Purchase & warranty', kv([
        ['Supplier', esc(a.supplier)], ['Purchase date', fmtDate(a.purchase_date, true)], ['Purchase cost', money(a.purchase_cost)], ['PO number', esc(a.po_number)], ['Invoice number', esc(a.invoice_number)],
        ['Warranty', a.warranty_end ? `${fmtDate(a.warranty_start)} → ${fmtDate(a.warranty_end)} ${badge(a.warranty_status)}` : ''],
        ...a.warranties.slice(1).map((w) => [`Extra warranty`, `${esc(w.warranty_type)} · ${esc(w.provider || '')} until ${fmtDate(w.end_date)}`]),
      ]))}</div>
      <div class="stack">${card('QR code', `<div class="qr-box"><img src="/api/assets/${a.id}/qr.svg" alt="QR code for ${esc(a.asset_tag)}"><div class="mono" style="margin-top:6px"><b>${esc(a.asset_tag)}</b></div>
        <div class="cell-sub">Scan to open this profile (sign-in required). No credentials are encoded.</div>
        <a class="btn sm" style="margin-top:8px" href="#/print/labels?ids=${a.id}">Print QR sticker</a></div>`)}
      ${card('Relationship', relationshipHtml(a.relationship))}</div></div>`,
    assignment: () => {
      const cur = a.assignments.find((x) => x.status === 'Active');
      return `<div class="stack">${card('Current assignment', cur ? kv([
        ['Employee', `<a href="#/employees/${cur.employee_id}"><b>${esc(cur.employee_name)}</b></a> (${esc(cur.employee_code)})`], ['Department', esc(cur.department)], ['Location', esc(cur.location)],
        ['Assigned date', fmtDate(cur.assigned_date, true)], ['Condition', esc(cur.condition_on_assign)], ['Issued by', esc(cur.issued_by)], ['Notes', esc(cur.notes)],
      ]) : `<div class="empty-state">Not assigned. ${can('assets.assign') && a.status === 'Available' ? '<button class="btn primary sm" data-do="assign">Deploy now</button>' : ''}</div>`)}
      <section class="card"><div class="card-head"><h3>Assignment history</h3><span class="muted">previous assignments are never deleted</span></div><div class="card-body flush" data-assign></div></section></div>`;
    },
    history: () => card('Asset timeline', timeline(a.history), can('reports.export') ? `<a class="btn sm" href="/api/reports/history?asset_id=${a.id}&format=pdf">PDF</a>` : ''),
    maintenance: () => `<section class="card"><div class="card-head"><h3>Maintenance & repairs</h3>${can('maintenance.manage') && !['Retired', 'Disposed'].includes(a.status) ? '<button class="btn sm primary" data-do="maint">+ Log maintenance</button>' : ''}</div><div class="card-body flush" data-maint></div></section>`,
    network: () => `<div class="grid g2"><div class="stack">${card('Network details', kv([
      ['IP address', primaryIp ? `<span class="mono"><b>${esc(primaryIp.address)}</b></span> ${badge(primaryIp.ip_type)} ${badge(primaryIp.status)}` : ''],
      ['MAC address', `<span class="mono">${esc((primaryIp && primaryIp.mac_address) || a.mac_address || '')}</span>`], ['Hostname', esc(primaryIp?.hostname)],
      ['Network', primaryIp ? `<a href="#/networks/${primaryIp.network_id}">${esc(primaryIp.network_name)}</a>` : ''], ['Subnet', primaryIp ? `<span class="mono">${esc(primaryIp.cidr)}</span>` : ''],
      ['Gateway', `<span class="mono">${esc(primaryIp?.gateway || '')}</span>`], ['DNS', `<span class="mono">${esc([primaryIp?.dns_primary, primaryIp?.dns_secondary].filter(Boolean).join(', '))}</span>`],
      ['Connected to', a.connected_device ? `<a href="#/devices/${a.connected_device.id}">${esc(a.connected_device.name)}</a> (${esc(a.connected_device.device_type)})` : ''],
      ['Network device', a.network_device ? `<a href="#/devices/${a.network_device.id}">${esc(a.network_device.name)}</a> ${badge(a.network_device.status)}` : ''],
    ]), can('network.manage') ? '<button class="btn sm primary" data-do="ip">+ Assign IP</button>' : '')}
      ${a.ips.length > 1 ? card('All IP addresses', `<ul class="list">${a.ips.map((i) => `<li><span class="mono grow"><b>${esc(i.address)}</b></span>${esc(i.network_name)} ${badge(i.status)}</li>`).join('')}</ul>`) : ''}</div>
      ${card('Asset → Network → ISP', relationshipHtml(a.relationship))}</div>`,
    documents: () => `<section class="card"><div class="card-head"><h3>Documents</h3>${can('documents.upload') ? '<button class="btn sm primary" data-do="doc">+ Upload</button>' : ''}</div>
      <div class="card-body flush">${a.documents.length ? `<ul class="list">${a.documents.map((d) => `<li><div class="act-icon">${icon('file')}</div><div class="grow"><a href="/api/documents/${d.id}/download?inline=1" target="_blank" rel="noopener">${esc(d.original_name)}</a>
        <div class="meta">${esc(d.doc_type)} · ${(d.size_bytes / 1024).toFixed(0)} KB · ${fmtDateTime(d.created_at)}</div></div>
        <a class="btn xs" href="/api/documents/${d.id}/download">Download</a>${can('documents.upload') ? `<button class="btn xs ghost" data-deldoc="${d.id}">Delete</button>` : ''}</li>`).join('')}</ul>` : '<div class="empty-state">No receipts, invoices or warranty files yet</div>'}</div></section>`,
  };
  const show = (k) => {
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === k));
    pane.innerHTML = panes[k]();
    history.replaceState(null, '', `#/assets/${encodeURIComponent(idOrTag)}${k === 'overview' ? '' : `?tab=${k}`}`);
    if (k === 'assignment') {
      mountTable(pane.querySelector('[data-assign]'), {
        rows: a.assignments, empty: 'Never assigned',
        columns: [
          { key: 'employee_name', label: 'Employee', render: (x) => `<a href="#/employees/${x.employee_id}">${esc(x.employee_name)}</a>` },
          { key: 'department', label: 'Department' }, { key: 'location', label: 'Location' },
          { key: 'assigned_date', label: 'From', render: (x) => fmtDate(x.assigned_date) },
          { key: 'ended_date', label: 'To', render: (x) => (x.ended_date ? fmtDate(x.ended_date) : '<span class="muted">present</span>') },
          { key: 'status', label: 'Status', render: (x) => badge(x.status) }, { key: 'notes', label: 'Notes' },
        ],
      });
    }
    if (k === 'maintenance') {
      mountTable(pane.querySelector('[data-maint]'), {
        rows: a.maintenance, empty: 'No maintenance records',
        columns: [
          { key: 'reported_date', label: 'Reported', render: (m) => fmtDate(m.reported_date) }, { key: 'issue', label: 'Issue', render: (m) => `<b>${esc(m.issue)}</b>` },
          { key: 'technician', label: 'Technician' }, { key: 'vendor', label: 'Vendor' }, { key: 'repair_cost', label: 'Cost', render: (m) => money(m.repair_cost) },
          { key: 'parts_replaced', label: 'Parts' }, { key: 'repair_end', label: 'Completed', render: (m) => fmtDate(m.repair_end) }, { key: 'status', label: 'Status', render: (m) => badge(m.status) },
          { key: 'x', label: '', nosort: true, render: (m) => (can('maintenance.manage') ? `<button class="btn xs" data-editm="${m.id}">Update</button>` : '') },
        ],
      });
    }
  };
  el.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
  on(el, 'click', '[data-do]', async (_e, b) => {
    const k = b.dataset.do;
    if (k === 'assign') deployModal({ assetId: a.id });
    if (k === 'transfer') transferModal({ assetId: a.id });
    if (k === 'return') returnModal({ assetId: a.id });
    if (k === 'maint') maintenanceModal({ assetId: a.id });
    if (k === 'retire') retireModal(a);
    if (k === 'ip') ipModal({ assetId: a.id });
    if (k === 'doc') uploadDocModal('asset', a.id);
    if (k === 'delete' && await confirmDialog('Delete asset', `Permanently delete <b>${esc(a.asset_tag)}</b>? Only possible for assets that were never assigned.`, { confirmLabel: 'Delete' })) {
      await api.del(`/assets/${a.id}`); await loadLookups(true); toast('Asset deleted'); location.hash = '#/assets';
    }
  });
  on(el, 'click', '[data-editm]', (_e, b) => { const m = a.maintenance.find((x) => String(x.id) === b.dataset.editm); maintenanceModal({ record: { ...m, asset_tag: a.asset_tag, asset_name: a.name } }); });
  on(el, 'click', '[data-deldoc]', async (_e, b) => {
    if (await confirmDialog('Delete document', 'Delete this document permanently?', { confirmLabel: 'Delete' })) { await api.del(`/documents/${b.dataset.deldoc}`); await afterChange('Document deleted'); }
  });
  show(panes[tab] ? tab : 'overview');
}

// ───────── Categories ─────────
export async function categories(el) {
  setTitle('Categories');
  const rows = await api.get('/settings/categories');
  const manage = can('settings.manage');
  el.innerHTML = `<div class="page-head"><div><h1>Asset Categories</h1><p>Each category has a tag prefix used for automatic numbering (e.g. LAP-0001).</p></div>
    <div class="page-actions">${manage ? '<button class="btn primary" data-add>+ Add category</button>' : ''}</div></div><section class="card" data-t></section>`;
  const next = await Promise.all(rows.map((c) => api.get(`/assets/next-tag?category_id=${c.id}`).then((r) => r.tag)));
  rows.forEach((c, i) => { c.next_tag = next[i]; });
  mountTable(el.querySelector('[data-t]'), {
    rows,
    columns: [
      { key: 'name', label: 'Category', render: (c) => `<b>${esc(c.name)}</b>` }, { key: 'prefix', label: 'Prefix', render: (c) => `<span class="mono">${esc(c.prefix)}</span>` },
      { key: 'type_group', label: 'Type (for charts)' }, { key: 'is_network', label: 'Network device', render: (c) => (c.is_network ? badge('Yes', 'blue') : '<span class="muted">No</span>') },
      { key: 'usage', label: 'Assets', render: (c) => `<a href="#/assets?category_id=${c.id}">${c.usage}</a>` }, { key: 'next_tag', label: 'Next tag', render: (c) => `<span class="mono">${esc(c.next_tag)}</span>` },
      { key: 'x', label: '', nosort: true, render: (c) => (manage ? `<button class="btn xs" data-edit="${c.id}">Edit</button> ${c.usage ? '' : `<button class="btn xs ghost" data-del="${c.id}">Delete</button>`}` : '') },
    ],
  });
  const TYPES = ['Laptop', 'Desktop', 'Monitor', 'Printer', 'Network Device', 'Mobile', 'Server', 'Accessories', 'Other'];
  const edit = (c = {}) => openModal({
    title: c.id ? `Edit ${c.name}` : 'Add category',
    body: formHtml([
      { name: 'name', label: 'Name', required: true }, { name: 'prefix', label: 'Tag prefix', required: true, help: 'Letters only, e.g. LAP, MON, NET' },
      { name: 'type_group', label: 'Type group', type: 'select', placeholder: false, options: opt(TYPES) }, { name: 'is_network', label: 'Is a network device', type: 'checkbox' },
      { name: 'description', label: 'Description', type: 'textarea', span: 2 },
    ], c),
    onSubmit: async (f) => {
      const b = readForm(f);
      b.prefix = b.prefix.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.id) await api.put(`/settings/categories/${c.id}`, b); else await api.post('/settings/categories', b);
      await afterChange('Category saved');
    },
  });
  on(el, 'click', '[data-add]', () => edit());
  on(el, 'click', '[data-edit]', (_e, b) => edit(rows.find((c) => String(c.id) === b.dataset.edit)));
  on(el, 'click', '[data-del]', async (_e, b) => { if (await confirmDialog('Delete category', 'Delete this category?', { confirmLabel: 'Delete' })) { await api.del(`/settings/categories/${b.dataset.del}`); await afterChange('Category deleted'); } });
}
