import {
  api, esc, dash, badge, fmtDate, money, can, mountTable, filterBar, readFilters, qs, debounce, setTitle, on, loadLookups, opt, openModal, formHtml,
  readForm, confirmDialog, kv, card, timeAgo, revealSecret, copySecret, toast,
} from '../core.js';
import { icon } from '../icons.js';
import { ipModal, afterChange, maintenanceModal } from './actions.js';
import { timeline } from './assets.js';

const DEVICE_TYPES = ['Router', 'Firewall', 'Switch', 'Managed Switch', 'Access Point', 'Modem/ONT', 'VPN Gateway', 'Wi-Fi Controller', 'Load Balancer'];
const mono = (v) => `<span class="mono">${dash(v)}</span>`;

// ───────── IP addresses ─────────
export async function ips(el, _m, params) {
  setTitle('IP Addresses');
  const L = await loadLookups();
  const meta = await api.get('/network/meta');
  el.innerHTML = `<div class="page-head"><div><h1>IP Address Management</h1><p>Every IP: which device and asset use it, who holds it, and which network it belongs to.</p></div>
    <div class="page-actions">${can('reports.export') ? '<a class="btn" href="/api/reports/ips?format=csv">Export CSV</a>' : ''}${can('network.manage') ? '<button class="btn primary" data-new>+ Add / assign IP</button>' : ''}</div></div>
    <section class="card">${filterBar([
    { type: 'search', name: 'q', placeholder: 'Search IP, MAC, hostname, device, asset tag, employee…' },
    { name: 'network_id', label: 'All networks', options: opt(L.networks, 'id', (n) => `${n.name} (${n.cidr})`) },
    { name: 'ip_type', label: 'All types', options: opt(meta.ip_types) },
    { name: 'status', label: 'All statuses', options: opt(meta.ip_statuses) },
  ], params)}<div data-t></div></section>`;
  let rows = [];
  const table = mountTable(el.querySelector('[data-t]'), {
    rows, pageSize: 100,
    columns: [
      { key: 'address', label: 'IP Address', sort: (i) => i.address_num, render: (i) => `<span class="mono t-strong">${esc(i.address)}</span>${i.hostname ? `<div class="cell-sub">${esc(i.hostname)}</div>` : ''}` },
      { key: 'device', label: 'Device Name', render: (i) => (i.device ? esc(i.device) : '<span class="muted">—</span>') },
      { key: 'asset_tag', label: 'Asset Tag', render: (i) => (i.asset_id ? `<a class="mono" href="#/assets/${i.asset_id}">${esc(i.asset_tag)}</a>` : '<span class="muted">—</span>') },
      { key: 'employee_name', label: 'Assigned To', render: (i) => (i.employee_id ? `<a href="#/employees/${i.employee_id}">${esc(i.employee_name)}</a>` : '<span class="muted">—</span>') },
      { key: 'mac_address', label: 'MAC', render: (i) => mono(i.mac_address) },
      { key: 'network_name', label: 'Network', render: (i) => `<a href="#/networks/${i.network_id}">${esc(i.network_name)}</a>` },
      { key: 'location', label: 'Location' },
      { key: 'ip_type', label: 'Type', render: (i) => badge(i.ip_type) },
      { key: 'status', label: 'Status', render: (i) => badge(i.status) },
      { key: 'x', label: 'Actions', nosort: true, render: (i) => (can('network.manage') ? `<button class="btn xs" data-edit="${i.id}">Edit</button> <button class="btn xs ghost" data-del="${i.id}">Release</button>` : '') },
    ],
  });
  const load = async () => { const f = readFilters(el); history.replaceState(null, '', `#/ips${qs(f)}`); rows = await api.get(`/network/ips${qs(f)}`); table.update(rows); };
  el.querySelector('.filters').addEventListener('input', debounce(load));
  on(el, 'click', '[data-new]', () => ipModal({ networkId: readFilters(el).network_id }));
  on(el, 'click', '[data-edit]', (_e, b) => ipModal({ ip: rows.find((i) => String(i.id) === b.dataset.edit) }));
  on(el, 'click', '[data-del]', async (_e, b) => {
    const ip = rows.find((i) => String(i.id) === b.dataset.del);
    if (await confirmDialog('Release IP', `Remove the record for <b>${esc(ip.address)}</b>? The address becomes available again.`, { confirmLabel: 'Release' })) {
      await api.del(`/network/ips/${ip.id}`); await afterChange(`${ip.address} released`);
    }
  });
  await load();
}

// ───────── Networks ─────────
const utilBar = (n) => `<div class="progress" title="${n.used} used · ${n.reserved} reserved · ${n.available} available">
  <span style="width:${(n.used / n.total) * 100}%;background:#2a78d6"></span><span style="width:${(n.reserved / n.total) * 100}%;background:#4a3aa7"></span></div>
  <div class="legend"><span><i style="background:#2a78d6"></i>Used <b>${n.used}</b></span><span><i style="background:#4a3aa7"></i>Reserved <b>${n.reserved}</b></span><span><i style="background:var(--border-strong)"></i>Available <b>${n.available}</b></span></div>`;

async function networkModal(n = null) {
  const L = await loadLookups();
  openModal({
    title: n ? `Edit ${n.name}` : 'Add network / subnet',
    size: 'lg',
    body: formHtml([
      { name: 'name', label: 'Network name', required: true, placeholder: 'Main Office LAN' },
      { name: 'cidr', label: 'Network (CIDR)', required: true, placeholder: '192.168.1.0/24' },
      { name: 'gateway', label: 'Gateway', placeholder: '192.168.1.1' }, { name: 'vlan_id', label: 'VLAN ID', type: 'number' },
      { name: 'dns_primary', label: 'DNS (primary)' }, { name: 'dns_secondary', label: 'DNS (secondary)' },
      { name: 'dhcp_start', label: 'DHCP range start' }, { name: 'dhcp_end', label: 'DHCP range end' },
      { name: 'location_id', label: 'Location', type: 'select', options: opt(L.locations) },
      { name: 'isp_id', label: 'ISP', type: 'select', options: opt(L.isps, 'id', (i) => `${i.provider_name} — ${i.connection_name}`) },
      { name: 'purpose', label: 'Purpose', type: 'select', options: opt(['LAN', 'Servers', 'Guest', 'Management', 'VoIP', 'CCTV', 'Other']) },
      { name: 'description', label: 'Description', span: 2 },
    ], n || {}),
    onSubmit: async (f) => {
      const b = readForm(f);
      if (n) await api.put(`/network/networks/${n.id}`, b); else await api.post('/network/networks', b);
      await afterChange('Network saved');
    },
  });
}

export async function networks(el) {
  setTitle('Networks');
  const list = await api.get('/network/networks');
  el.innerHTML = `<div class="page-head"><div><h1>Networks &amp; Subnets</h1><p>Address plans, gateways, DNS, DHCP ranges and utilization.</p></div>
    <div class="page-actions">${can('network.manage') ? '<button class="btn primary" data-new>+ Add network</button>' : ''}</div></div>
    <div class="grid g3">${list.map((n) => `<section class="card"><div class="card-head"><div><h3><a href="#/networks/${n.id}">${esc(n.name.toUpperCase())}</a></h3><div class="cell-sub">${esc(n.purpose || '')}${n.vlan_id ? ` · VLAN ${n.vlan_id}` : ''}</div></div>${n.conflicts ? badge(`${n.conflicts} conflict`, 'red') : ''}</div>
      <div class="card-body">${kv([['Network', mono(n.cidr)], ['Gateway', mono(n.gateway)], ['DNS', mono([n.dns_primary, n.dns_secondary].filter(Boolean).join(', '))],
      ['DHCP range', n.dhcp_start ? mono(`${n.dhcp_start} – ${n.dhcp_end}`) : '<span class="muted">None (static only)</span>'], ['Location', esc(n.location)], ['ISP', n.isp_name ? `${esc(n.isp_name)} ${badge(n.isp_role)}` : '']])}
      <div style="margin-top:14px">${utilBar(n)}</div></div></section>`).join('') || '<div class="card"><div class="empty-state">No networks yet</div></div>'}</div>`;
  on(el, 'click', '[data-new]', () => networkModal());
}

export async function networkDetail(el, [id]) {
  const n = await api.get(`/network/networks/${id}`);
  setTitle(n.name);
  el.innerHTML = `<div class="crumbs"><a href="#/networks">Networks</a> / ${esc(n.name)}</div>
  <div class="page-head"><div><h1>${esc(n.name.toUpperCase())}</h1><p>${mono(n.cidr)} · netmask ${mono(n.netmask)} · ${n.total} usable hosts</p></div>
    <div class="page-actions">${can('network.manage') ? '<button class="btn primary" data-addip>+ Add IP</button><button class="btn" data-edit>Edit</button><button class="btn ghost" data-del>Delete</button>' : ''}</div></div>
  <div class="stats" style="margin-bottom:16px">
    <div class="stat"><div class="label">Used IPs</div><div class="value">${n.used}</div></div><div class="stat"><div class="label">Available IPs</div><div class="value">${n.available}</div></div>
    <div class="stat"><div class="label">Reserved IPs</div><div class="value">${n.reserved}</div></div><div class="stat"><div class="label">DHCP pool size</div><div class="value">${n.dhcp_pool}</div></div>
    <div class="stat ${n.conflicts ? 'alert-bad' : ''}"><div class="label">Conflicts</div><div class="value">${n.conflicts}</div></div></div>
  <div class="grid split-1-2">
    <div class="stack">${card('Details', kv([['Network', mono(n.cidr)], ['Gateway', mono(n.gateway)], ['DNS', mono([n.dns_primary, n.dns_secondary].filter(Boolean).join(', '))],
    ['DHCP range', n.dhcp_start ? mono(`${n.dhcp_start} – ${n.dhcp_end}`) : ''], ['VLAN', esc(n.vlan_id)], ['Location', esc(n.location)], ['ISP', n.isp_name ? `<a href="#/isps">${esc(n.isp_name)}</a> ${badge(n.isp_role)}` : ''], ['Description', esc(n.description)]]))}
    ${card('Network devices', n.devices.length ? `<ul class="list">${n.devices.map((d) => `<li><div class="act-icon">${icon('router')}</div><div class="grow"><a href="#/devices/${d.id}"><b>${esc(d.name)}</b></a><div class="meta">${esc(d.device_type)} · ${esc(d.asset_tag || '')} · <span class="mono">${esc(d.ip_address || '')}</span></div></div>${badge(d.status)}</li>`).join('')}</ul>` : '<div class="muted">None</div>')}
    ${card('Wi-Fi on this network', n.wifi.length ? `<ul class="list">${n.wifi.map((w) => `<li><div class="act-icon">${icon('wifi')}</div><div class="grow"><b>${esc(w.ssid)}</b><div class="meta">${esc(w.security)} · ${esc(w.band || '')}</div></div></li>`).join('')}</ul>` : '<div class="muted">None</div>')}</div>
    <div class="stack"><section class="card"><div class="card-head"><h3>Address map</h3><div class="legend" style="margin:0">${[['#2a78d6', 'Used'], ['#4a3aa7', 'Reserved'], ['#e34948', 'Conflict'], ['var(--teal-bg)', 'DHCP pool'], ['var(--surface-2)', 'Free']].map(([c, l]) => `<span><i style="background:${c};border:1px solid var(--border)"></i>${l}</span>`).join('')}</div></div>
      <div class="card-body" data-map></div></section>
      <section class="card"><div class="card-head"><h3>IP addresses (${n.ips.length})</h3></div><div class="card-body flush" data-t></div></section></div></div>`;

  // Address map (for subnets up to /22).
  const toNum = (ip) => ip.split('.').reduce((a, b) => a * 256 + Number(b), 0);
  const toIp = (x) => [x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255].join('.');
  const [base, bits] = n.cidr.split('/');
  const size = 2 ** (32 - Number(bits));
  const mapEl = el.querySelector('[data-map]');
  if (size <= 1024) {
    const start = toNum(base);
    const byNum = new Map(n.ips.map((i) => [i.address_num, i]));
    const ds = n.dhcp_start ? toNum(n.dhcp_start) : null; const de = n.dhcp_end ? toNum(n.dhcp_end) : null;
    const gw = n.gateway ? toNum(n.gateway) : null;
    let cells = '';
    for (let x = start + 1; x < start + size - 1; x++) {
      const ip = byNum.get(x);
      let bg = 'var(--surface-2)'; let title = `${toIp(x)} — free`;
      if (ds !== null && x >= ds && x <= de) { bg = 'var(--teal-bg)'; title = `${toIp(x)} — DHCP pool`; }
      if (x === gw && !ip) { bg = '#2a78d6'; title = `${toIp(x)} — gateway`; }
      if (ip) {
        bg = ip.status === 'Conflict' ? '#e34948' : ip.status === 'Reserved' || (ip.ip_type === 'Reserved' && ip.status === 'Available') ? '#4a3aa7' : ip.status === 'Available' ? 'var(--surface-2)' : '#2a78d6';
        title = `${ip.address} — ${ip.device || 'unnamed'} (${ip.status})`;
      }
      cells += `<button type="button" data-cell="${toIp(x)}" title="${esc(title)}" style="width:100%;aspect-ratio:1;border:1px solid var(--border);border-radius:3px;background:${bg};cursor:pointer;padding:0"></button>`;
    }
    mapEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(${size > 256 ? 32 : 16},1fr);gap:3px">${cells}</div><div class="cell-sub" style="margin-top:8px">Hover a square for details; click to add or edit that address.</div>`;
  } else mapEl.innerHTML = '<div class="muted">Address map is shown for subnets of /22 or smaller.</div>';

  mountTable(el.querySelector('[data-t]'), {
    rows: n.ips, pageSize: 50,
    columns: [
      { key: 'address', label: 'IP', sort: (i) => i.address_num, render: (i) => `<span class="mono t-strong">${esc(i.address)}</span>` },
      { key: 'device', label: 'Device' }, { key: 'asset_tag', label: 'Asset', render: (i) => (i.asset_id ? `<a class="mono" href="#/assets/${i.asset_id}">${esc(i.asset_tag)}</a>` : '<span class="muted">—</span>') },
      { key: 'employee_name', label: 'Assigned To' }, { key: 'mac_address', label: 'MAC', render: (i) => mono(i.mac_address) },
      { key: 'ip_type', label: 'Type', render: (i) => badge(i.ip_type) }, { key: 'status', label: 'Status', render: (i) => badge(i.status) },
      { key: 'x', label: '', nosort: true, render: (i) => (can('network.manage') ? `<button class="btn xs" data-editip="${i.id}">Edit</button>` : '') },
    ],
  });
  on(el, 'click', '[data-cell]', (_e, b) => {
    if (!can('network.manage')) return;
    const ip = n.ips.find((i) => i.address === b.dataset.cell);
    if (ip) ipModal({ ip }); else ipModal({ networkId: n.id }).then(() => { const inp = document.querySelector('.modal [name=address]'); if (inp) inp.value = b.dataset.cell; });
  });
  on(el, 'click', '[data-editip]', (_e, b) => ipModal({ ip: n.ips.find((i) => String(i.id) === b.dataset.editip) }));
  on(el, 'click', '[data-addip]', () => ipModal({ networkId: n.id }));
  on(el, 'click', '[data-edit]', () => networkModal(n));
  on(el, 'click', '[data-del]', async () => {
    if (await confirmDialog('Delete network', `Delete <b>${esc(n.name)}</b>? It must have no IP records.`, { confirmLabel: 'Delete' })) { await api.del(`/network/networks/${n.id}`); await afterChange('Network deleted'); location.hash = '#/networks'; }
  });
}

// ───────── Network devices ─────────
async function deviceModal(d = null) {
  const L = await loadLookups();
  const netAssets = L.assets.filter((a) => a.is_network || String(a.id) === String(d?.asset_id));
  openModal({
    title: d ? `Edit ${d.name}` : 'Add network device',
    size: 'lg',
    body: formHtml([
      { name: 'name', label: 'Device name', required: true, placeholder: 'Main Router' },
      { name: 'device_type', label: 'Device type', type: 'select', required: true, options: opt(DEVICE_TYPES) },
      { name: 'asset_id', label: 'Linked asset', type: 'select', options: opt(netAssets, 'id', (a) => `${a.asset_tag} — ${a.name}`), help: 'The hardware record (brand, serial, warranty). IP/MAC come from the IP module.' },
      { name: 'status', label: 'Status', type: 'select', placeholder: false, options: opt(['Active', 'Inactive', 'Offline', 'Maintenance']), help: 'Set manually — no live monitoring yet' },
      { name: 'network_id', label: 'Network', type: 'select', options: opt(L.networks, 'id', (n) => `${n.name} (${n.cidr})`) },
      { name: 'isp_id', label: 'ISP (for edge devices)', type: 'select', options: opt(L.isps, 'id', (i) => `${i.provider_name} — ${i.connection_name}`) },
      { name: 'parent_device_id', label: 'Uplink device (topology)', type: 'select', options: opt(L.devices.filter((x) => x.id !== d?.id), 'id', (x) => `${x.name} (${x.device_type})`) },
      { name: 'location_id', label: 'Location', type: 'select', options: opt(L.locations) },
      { name: 'management_url', label: 'Management URL', placeholder: 'https://192.168.1.1' },
      { name: 'firmware_version', label: 'Firmware version' }, { name: 'port_count', label: 'Port count', type: 'number' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ], d || { status: 'Active' }),
    onSubmit: async (f) => {
      const b = readForm(f);
      const r = d ? await api.put(`/network/devices/${d.id}`, b) : await api.post('/network/devices', b);
      await afterChange('Device saved');
      if (!d) location.hash = `#/devices/${r.id}`;
    },
  });
}

export async function devices(el, _m, params) {
  setTitle('Network Devices');
  el.innerHTML = `<div class="page-head"><div><h1>Network Devices</h1><p>Routers, firewalls, switches, access points and more — linked to assets, IPs, networks and ISPs.</p></div>
    <div class="page-actions"><a class="btn" href="#/topology">View topology</a>${can('network.manage') ? '<button class="btn primary" data-new>+ Add device</button>' : ''}</div></div>
    <section class="card">${filterBar([{ type: 'search', name: 'q', placeholder: 'Search name, asset tag, IP, model…' }, { name: 'device_type', label: 'All types', options: opt(DEVICE_TYPES) }], params)}<div data-t></div></section>`;
  const table = mountTable(el.querySelector('[data-t]'), {
    rows: [], rowHref: (d) => `#/devices/${d.id}`,
    columns: [
      { key: 'name', label: 'Device', render: (d) => `<b>${esc(d.name)}</b><div class="cell-sub">${esc([d.brand, d.model].filter(Boolean).join(' '))}</div>` },
      { key: 'device_type', label: 'Type' }, { key: 'asset_tag', label: 'Asset Tag', render: (d) => mono(d.asset_tag) },
      { key: 'ip_address', label: 'IP', render: (d) => mono(d.ip_address) }, { key: 'mac', label: 'MAC', render: (d) => mono(d.ip_mac || d.asset_mac) },
      { key: 'network_name', label: 'Network' }, { key: 'isp_name', label: 'ISP' }, { key: 'parent_name', label: 'Uplink' }, { key: 'location', label: 'Location' },
      { key: 'status', label: 'Status', render: (d) => badge(d.status) },
      { key: 'credential_count', label: 'Credentials', render: (d) => (d.credential_count ? badge('SECURED', 'green') : '<span class="muted">—</span>') },
    ],
  });
  const load = async () => { const f = readFilters(el); history.replaceState(null, '', `#/devices${qs(f)}`); table.update(await api.get(`/network/devices${qs(f)}`)); };
  el.querySelector('.filters').addEventListener('input', debounce(load));
  on(el, 'click', '[data-new]', () => deviceModal());
  await load();
}

function credRows(creds, showActions = true) {
  if (!creds.length) return '<div class="muted">No credentials stored</div>';
  return `<ul class="list">${creds.map((c) => `<li><div class="act-icon">${icon('key')}</div><div class="grow"><b>${esc(c.name)}</b><div class="meta">User: <span class="mono">${esc(c.username || '—')}</span></div>
    <div style="margin-top:4px"><span class="secret" data-secret="${c.id}">••••••••••••</span></div></div>
    ${showActions ? `<div class="btn-group">${can('credentials.reveal') ? `<button class="btn xs" data-reveal="${c.id}">Show</button>` : ''}${can('credentials.copy') ? `<button class="btn xs" data-copy="${c.id}">Copy</button>` : ''}</div>` : ''}</li>`).join('')}</ul>`;
}

function bindSecrets(el, base) {
  on(el, 'click', '[data-reveal]', async (_e, b) => {
    try { await revealSecret(`${base}/${b.dataset.reveal}/secret`, el.querySelector(`[data-secret="${b.dataset.reveal}"]`), b); } catch (ex) { toast(ex.message, 'err'); }
  });
  on(el, 'click', '[data-copy]', async (_e, b) => {
    try { await copySecret(`${base}/${b.dataset.copy}/secret`); } catch (ex) { toast(ex.message, 'err'); }
  });
}

export async function deviceDetail(el, [id], params) {
  const d = await api.get(`/network/devices/${id}`);
  setTitle(d.name);
  const tab = params.tab || 'overview';
  const chain = [...d.uplink_chain].reverse();
  el.innerHTML = `<div class="crumbs"><a href="#/devices">Network Devices</a> / ${esc(d.name)}</div>
  <section class="card" style="margin-bottom:16px"><div class="profile-head"><div class="asset-photo">${icon('router')}</div>
    <div style="flex:1"><h1>${esc(d.name.toUpperCase())}</h1><div class="profile-meta">${esc(d.device_type)} · ${esc([d.brand, d.model].filter(Boolean).join(' '))} ${badge(d.status)} ${d.credential_count ? badge('Credentials: SECURED', 'green') : ''}</div></div>
    <div class="page-actions">${d.management_url ? `<a class="btn" href="${esc(d.management_url)}" target="_blank" rel="noopener noreferrer">Open management</a>` : ''}
      ${can('network.manage') ? '<button class="btn" data-edit>Edit</button><button class="btn ghost" data-del>Delete</button>' : ''}</div></div>
    <div class="facts">
      <div><small>Device</small><b>${esc([d.brand, d.model].filter(Boolean).join(' ') || d.device_type)}</b></div>
      <div><small>Asset Tag</small>${d.asset_id ? `<a class="mono" href="#/assets/${d.asset_id}"><b>${esc(d.asset_tag)}</b></a>` : '<span class="muted">—</span>'}</div>
      <div><small>IP</small><b class="mono">${dash(d.ip_address)}</b></div><div><small>MAC</small><b class="mono">${dash(d.ip_mac || d.asset_mac)}</b></div>
      <div><small>Network</small>${d.network_id ? `<a href="#/networks/${d.network_id}"><b>${esc(d.network_name)}</b></a>` : '<span class="muted">—</span>'}</div>
      <div><small>ISP</small><b>${dash(d.upstream_isp ? d.upstream_isp.provider_name : d.isp_name)}</b></div>
      <div><small>Location</small><b>${dash(d.location)}</b></div><div><small>Management URL</small><b class="mono">${dash(d.management_url)}</b></div>
      <div><small>Status</small>${badge(d.status)} <span class="cell-sub">${esc(d.status_source)}</span></div>
      <div><small>Credentials</small>${d.credential_count ? badge('SECURED', 'green') : '<span class="muted">None</span>'}</div></div></section>
  <div class="tabs">${[['overview', 'Overview'], ['maintenance', `Maintenance (${d.maintenance.length})`], ['history', `History (${d.history.length})`]].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div><div data-pane></div>`;
  const panes = {
    overview: () => `<div class="grid g2"><div class="stack">
      ${card('Connection path', `<div class="chain">${[
    d.upstream_isp ? `<div class="chain-node"><span class="kind">ISP</span><div><b>${esc(d.upstream_isp.provider_name)}</b> <span class="muted">${esc(d.upstream_isp.role)} · ${esc(d.upstream_isp.status)}</span></div></div>` : '',
    ...chain.map((c) => `<div class="chain-node" ${c.id === d.id ? 'style="border-color:var(--primary);background:var(--primary-soft)"' : ''}><span class="kind">${esc(c.device_type)}</span><div><a href="#/devices/${c.id}"><b>${esc(c.name)}</b></a> <span class="mono muted">${esc(c.asset_tag || '')} ${esc(c.ip_address || '')}</span></div></div>`),
    d.children.length ? `<div class="chain-node"><span class="kind">Downlinks</span><div>${d.children.map((c) => `<a href="#/devices/${c.id}">${esc(c.name)}</a> <span class="mono muted">${esc(c.ip_address || '')}</span>`).join('<br>')}</div></div>` : '',
    d.clients.length ? `<div class="chain-node"><span class="kind">Clients</span><div>${d.clients.map((c) => `<a class="mono" href="#/assets/${c.id}">${esc(c.asset_tag)}</a>`).join(', ')}</div></div>` : '',
  ].filter(Boolean).join('<div class="chain-arrow">↓</div>')}</div>`)}
      ${card('Details', kv([['Firmware', esc(d.firmware_version)], ['Ports', esc(d.port_count)], ['Serial', mono(d.serial_number)], ['Uplink', d.parent_device_id ? `<a href="#/devices/${d.parent_device_id}">${esc(d.parent_name)}</a>` : ''], ['Notes', esc(d.notes)]]))}</div>
      <div class="stack">${card('Credentials', `${credRows(d.credentials)}<div class="cell-sub" style="margin-top:8px">Passwords are encrypted; every reveal/copy is audit-logged. <a href="#/credentials">Open vault</a></div>`)}
      ${d.wifi.length ? card('Wi-Fi broadcast', `<ul class="list">${d.wifi.map((w) => `<li><div class="act-icon">${icon('wifi')}</div><div class="grow"><b>${esc(w.ssid)}</b><div class="meta">${esc(w.security)} · ${esc(w.band || '')}</div></div></li>`).join('')}</ul>`) : ''}</div></div>`,
    maintenance: () => `<section class="card"><div class="card-head"><h3>Maintenance</h3>${d.asset_id && can('maintenance.manage') ? '<button class="btn sm primary" data-maint>+ Log maintenance</button>' : ''}</div><div class="card-body flush">${d.maintenance.length ? `<ul class="list">${d.maintenance.map((m) => `<li><div class="grow"><b>${esc(m.issue)}</b><div class="meta">${fmtDate(m.reported_date)} · ${esc(m.technician || '')} ${m.repair_cost ? `· ${money(m.repair_cost)}` : ''}</div></div>${badge(m.status)}</li>`).join('')}</ul>` : `<div class="empty-state">${d.asset_id ? 'No maintenance records' : 'Link an asset to track maintenance'}</div>`}</div></section>`,
    history: () => card('History', d.asset_id ? timeline(d.history) : '<div class="muted">Link an asset to see its history</div>'),
  };
  const pane = el.querySelector('[data-pane]');
  const show = (k) => { el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === k)); pane.innerHTML = panes[k](); };
  el.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
  bindSecrets(el, '/vault/credentials');
  on(el, 'click', '[data-maint]', () => maintenanceModal({ assetId: d.asset_id }));
  on(el, 'click', '[data-edit]', () => deviceModal(d));
  on(el, 'click', '[data-del]', async () => {
    if (await confirmDialog('Delete device', `Delete network device <b>${esc(d.name)}</b>? The linked asset is kept.`, { confirmLabel: 'Delete' })) { await api.del(`/network/devices/${d.id}`); await afterChange('Device deleted'); location.hash = '#/devices'; }
  });
  show(panes[tab] ? tab : 'overview');
}

// ───────── ISPs ─────────
async function ispModal(i = null) {
  const L = await loadLookups();
  openModal({
    title: i ? `Edit ${i.provider_name}` : 'Add ISP connection',
    size: 'lg',
    body: formHtml([
      { type: 'section', label: 'Connection' },
      { name: 'provider_name', label: 'Provider', required: true, placeholder: 'Converge / PLDT / Globe Business' },
      { name: 'connection_name', label: 'Connection name', required: true, placeholder: 'Main Office Internet' },
      { name: 'role', label: 'Role', type: 'select', placeholder: false, options: opt(['Primary', 'Backup']) },
      { name: 'status', label: 'Status (manual)', type: 'select', placeholder: false, options: opt(['Active', 'Inactive', 'Down', 'Suspended']) },
      { name: 'connection_type', label: 'Type', type: 'select', options: opt(['Fiber', 'DSL', 'Cable', 'LTE', '5G', 'Satellite', 'Leased Line', 'Microwave']) },
      { name: 'plan', label: 'Plan' }, { name: 'speed', label: 'Speed', placeholder: '500 Mbps' },
      { name: 'public_ip', label: 'Public IP' }, { name: 'account_number', label: 'Account number' },
      { name: 'router_device_id', label: 'Router / edge device', type: 'select', options: opt(L.devices, 'id', (d) => `${d.name} (${d.device_type})`) },
      { name: 'location_id', label: 'Location', type: 'select', options: opt(L.locations) },
      { type: 'section', label: 'Contract' },
      { name: 'contract_start', label: 'Contract start', type: 'date' }, { name: 'contract_end', label: 'Contract expiration', type: 'date' },
      { name: 'monthly_cost', label: `Monthly cost (${L.currency})`, type: 'number', step: '0.01' },
      { type: 'section', label: 'Support' },
      { name: 'support_contact', label: 'Support contact' }, { name: 'support_number', label: 'Support number' }, { name: 'support_email', label: 'Support email', type: 'email' },
      { name: 'monitor_target', label: 'Monitor target (future)', placeholder: 'e.g. 8.8.8.8 via this WAN', help: 'Reserved for future ping monitoring; not active yet' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ], i || { role: 'Primary', status: 'Active' }),
    onSubmit: async (f) => {
      const b = readForm(f);
      if (i) await api.put(`/network/isps/${i.id}`, b); else await api.post('/network/isps', b);
      await afterChange('ISP saved');
    },
  });
}

export async function isps(el) {
  setTitle('ISPs');
  const list = await api.get('/network/isps');
  const meta = await api.get('/network/meta');
  el.innerHTML = `<div class="page-head"><div><h1>ISP Management</h1><p>Internet connections, contracts and support contacts. Status is updated manually (live monitoring can be added later).</p></div>
    <div class="page-actions">${can('reports.export') ? '<a class="btn needs-pdf" href="/api/reports/isps?format=pdf">PDF</a><a class="btn only-no-pdf" href="/api/reports/isps?format=csv">CSV</a>' : ''}${can('network.manage') ? '<button class="btn primary" data-new>+ Add ISP</button>' : ''}</div></div>
    <div class="grid g3">${list.map((i) => {
    const soon = i.contract_days_left !== null && i.contract_days_left <= meta.contract_alert_days;
    return `<section class="card"><div class="card-head"><div><h3>${esc(i.provider_name.toUpperCase())}</h3><div class="cell-sub">${esc(i.connection_name)}</div></div><div>${badge(i.role)} ${badge(i.status)}</div></div>
      <div class="card-body">${kv([['Type', esc(i.connection_type)], ['Plan', esc(i.plan)], ['Speed', `<b>${esc(i.speed || '')}</b>`], ['Public IP', mono(i.public_ip)], ['Account no.', mono(i.account_number)],
      ['Router', i.router_device_id ? `<a href="#/devices/${i.router_device_id}">${esc(i.router_tag || i.router_name)}</a>` : ''], ['Location', esc(i.location)],
      ['Contract', i.contract_start || i.contract_end ? `${fmtDate(i.contract_start)} → ${fmtDate(i.contract_end)}${soon ? ` ${badge(i.contract_days_left < 0 ? 'Expired' : `${i.contract_days_left} days left`, i.contract_days_left < 0 ? 'red' : 'amber')}` : ''}` : ''],
      ['Monthly cost', money(i.monthly_cost)], ['Support', `${esc(i.support_contact || '')}${i.support_number ? `<br><span class="mono">${esc(i.support_number)}</span>` : ''}`], ['Notes', esc(i.notes)],
      ['Status updated', `${timeAgo(i.status_updated_at)} <span class="cell-sub">(${esc(i.status_source)})</span>`]])}</div>
      ${can('network.manage') ? `<div class="form-actions" style="justify-content:space-between"><select data-status="${i.id}" style="height:30px;border-radius:7px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text)">${['Active', 'Inactive', 'Down', 'Suspended'].map((s) => `<option ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <div class="btn-group"><button class="btn sm" data-edit="${i.id}">Edit</button><button class="btn sm ghost" data-del="${i.id}">Delete</button></div></div>` : ''}</section>`;
  }).join('') || '<div class="card"><div class="empty-state">No ISPs yet</div></div>'}</div>`;
  on(el, 'click', '[data-new]', () => ispModal());
  on(el, 'click', '[data-edit]', (_e, b) => ispModal(list.find((i) => String(i.id) === b.dataset.edit)));
  on(el, 'change', '[data-status]', async (_e, s) => { await api.put(`/network/isps/${s.dataset.status}`, { status: s.value }); await afterChange(`Status set to ${s.value}`); });
  on(el, 'click', '[data-del]', async (_e, b) => {
    if (await confirmDialog('Delete ISP', 'Delete this ISP connection?', { confirmLabel: 'Delete' })) { await api.del(`/network/isps/${b.dataset.del}`); await afterChange('ISP deleted'); }
  });
}

// ───────── Topology ─────────
export async function topology(el) {
  setTitle('Topology');
  const t = await api.get('/network/topology');
  const devNode = (d) => `<li><a class="node" href="#/devices/${d.id}"><span class="type">${esc(d.device_type)}</span><b>${esc(d.name)}</b><span class="mono muted">${esc(d.asset_tag || '')} ${esc(d.ip_address || '')}</span>${badge(d.status)}</a>
    ${d.clients.length ? `<ul class="client-list">${d.clients.map((c) => `<li><a href="#/assets/${c.id}" title="${esc(c.name)}">${esc(c.asset_tag)}${c.ip_address ? ` · ${esc(c.ip_address)}` : ''}</a></li>`).join('')}</ul>` : ''}
    ${d.children.length ? `<ul class="tree">${d.children.map(devNode).join('')}</ul>` : ''}</li>`;
  el.innerHTML = `<div class="page-head"><div><h1>Network Topology</h1><p>ISP → router → switches / firewalls → access points → client devices. Built from each device's uplink and each asset's “connected to”.</p></div></div>
    <div class="stack">${t.isps.map((i) => `<section class="card"><div class="card-body"><ul class="tree root"><li><span class="node isp"><span class="type">ISP · ${esc(i.role)}</span><b>${esc(i.provider_name)}</b><span class="muted">${esc(i.connection_name)} ${esc(i.speed || '')}</span>${badge(i.status)}</span>
      ${i.devices.length ? `<ul class="tree">${i.devices.map(devNode).join('')}</ul>` : '<div class="cell-sub" style="margin:6px 0 0 20px">No edge device linked to this ISP</div>'}</li></ul></div></section>`).join('')}
    ${t.unlinked.length ? `<section class="card"><div class="card-head"><h3>Devices without an ISP / uplink</h3></div><div class="card-body"><ul class="tree root">${t.unlinked.map(devNode).join('')}</ul></div></section>` : ''}</div>`;
}

// ───────── Wi-Fi ─────────
async function wifiModal(w = null) {
  const L = await loadLookups();
  openModal({
    title: w ? `Edit ${w.ssid}` : 'Add Wi-Fi network',
    size: 'lg',
    body: formHtml([
      { name: 'ssid', label: 'SSID', required: true },
      { name: 'password', label: w ? 'New password (leave blank to keep)' : 'Password', type: 'password' },
      { name: 'security', label: 'Security', type: 'select', placeholder: false, options: opt(['WPA2/WPA3', 'WPA3-Personal', 'WPA2-Personal', 'WPA2-Enterprise', 'WPA3-Enterprise', 'Open']) },
      { name: 'band', label: 'Band', type: 'select', options: opt(['2.4 GHz', '5 GHz', '6 GHz', 'Dual (2.4/5 GHz)', 'Tri-band']) },
      { name: 'network_id', label: 'Network', type: 'select', options: opt(L.networks, 'id', (n) => `${n.name} (${n.cidr})`) },
      { name: 'access_point_id', label: 'Access point', type: 'select', options: opt(L.devices, 'id', (d) => `${d.name} (${d.device_type})`) },
      { name: 'location_id', label: 'Location', type: 'select', options: opt(L.locations) },
      { name: 'is_guest', label: 'Guest network', type: 'checkbox' }, { name: 'is_hidden', label: 'Hidden SSID', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ], w || { security: 'WPA2/WPA3' }),
    onSubmit: async (f) => {
      const b = readForm(f);
      if (w) await api.put(`/vault/wifi/${w.id}`, b); else await api.post('/vault/wifi', b);
      await afterChange('Wi-Fi network saved');
    },
  });
}

export async function wifi(el) {
  setTitle('Wi-Fi');
  const list = await api.get('/vault/wifi');
  el.innerHTML = `<div class="page-head"><div><h1>Wi-Fi Networks</h1><p>SSIDs and their passwords. Passwords stay hidden unless you have reveal/copy permission; every access is logged.</p></div>
    <div class="page-actions">${can('wifi.manage') ? '<button class="btn primary" data-new>+ Add Wi-Fi</button>' : ''}</div></div>
    <div class="grid g3">${list.map((w) => `<section class="card"><div class="card-head"><div style="display:flex;gap:10px;align-items:center"><div class="act-icon">${icon('wifi')}</div><div><h3>${esc(w.ssid)}</h3><div class="cell-sub">${w.is_guest ? 'Guest · ' : ''}${w.is_hidden ? 'Hidden · ' : ''}${esc(w.band || '')}</div></div></div></div>
      <div class="card-body">${kv([['SSID', `<b>${esc(w.ssid)}</b>`], ['Password', w.has_password ? `<span class="secret" data-secret="${w.id}">••••••••••••</span>` : '<span class="muted">Open network</span>'],
      ['Security', esc(w.security)], ['Network', w.network_id ? `<a href="#/networks/${w.network_id}">${esc(w.network_name)}</a> <span class="mono muted">${esc(w.cidr)}</span>` : ''],
      ['Access point', w.access_point_id ? `<a href="#/devices/${w.access_point_id}">${esc(w.access_point_tag || w.access_point_name)}</a>` : ''], ['Location', esc(w.location)], ['Notes', esc(w.notes)]])}</div>
      <div class="form-actions" style="justify-content:flex-start">${w.has_password && w.access.reveal ? `<button class="btn sm" data-reveal="${w.id}">Show password</button>` : ''}${w.has_password && w.access.copy ? `<button class="btn sm" data-copy="${w.id}">Copy password</button>` : ''}
        ${w.access.edit ? `<button class="btn sm" data-edit="${w.id}">Edit</button><button class="btn sm ghost" data-del="${w.id}">Delete</button>` : ''}${!w.access.reveal && !w.access.copy ? '<span class="cell-sub">No permission to reveal passwords</span>' : ''}</div></section>`).join('') || '<div class="card"><div class="empty-state">No Wi-Fi networks yet</div></div>'}</div>`;
  bindSecrets(el, '/vault/wifi');
  on(el, 'click', '[data-new]', () => wifiModal());
  on(el, 'click', '[data-edit]', (_e, b) => wifiModal(list.find((w) => String(w.id) === b.dataset.edit)));
  on(el, 'click', '[data-del]', async (_e, b) => {
    if (await confirmDialog('Delete Wi-Fi', 'Delete this Wi-Fi network?', { confirmLabel: 'Delete' })) { await api.del(`/vault/wifi/${b.dataset.del}`); await afterChange('Wi-Fi deleted'); }
  });
}
