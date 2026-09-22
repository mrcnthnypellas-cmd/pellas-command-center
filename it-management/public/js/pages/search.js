import { api, esc, badge, setTitle } from '../core.js';
import { icon } from '../icons.js';

const row = (href, title, sub, right = '') => `<a class="search-hit" href="${href}"><div style="display:flex;gap:12px;align-items:center"><div class="grow" style="flex:1;min-width:0"><b>${title}</b><div class="cell-sub">${sub}</div></div>${right}</div></a>`;

export async function render(el, _m, params) {
  const q = params.q || '';
  setTitle(`Search: ${q}`);
  const input = document.querySelector('#gsearch input');
  if (input) input.value = q;
  const { results } = await api.get(`/search?q=${encodeURIComponent(q)}`);
  const groups = [];
  if (results.ips) {
    groups.push(['IP addresses', 'hash', results.ips.map((i) => `<div class="search-hit"><div class="grid g2" style="gap:6px 24px"><div><span class="cell-sub">IP</span><div class="mono" style="font-size:16px"><b>${esc(i.address)}</b></div></div><div>${badge(i.status)} ${badge(i.ip_type)}</div></div>
      <dl class="kv" style="margin-top:8px">${[
      ['Device', esc(i.device || '—')], ['Asset', i.asset_id ? `<a class="mono" href="#/assets/${i.asset_id}">${esc(i.asset_tag)}</a>` : '—'],
      ['Employee', i.employee_id ? `<a href="#/employees/${i.employee_id}">${esc(i.employee_name)}</a>` : '—'], ['Department', esc(i.department || '—')],
      ['Location', esc(i.location || '—')], ['Network', `<a href="#/networks/${i.network_id}">${esc(i.network_name)}</a> <span class="mono muted">${esc(i.cidr)}</span>`],
      ['ISP', esc(i.isp_name || '—')], ['MAC', `<span class="mono">${esc(i.mac_address || '—')}</span>`], ['Status', esc(i.status)],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>`).join('')]);
  }
  if (results.assets) groups.push(['Assets', 'box', results.assets.map((a) => row(`#/assets/${a.id}`, `<span class="mono">${esc(a.asset_tag)}</span> · ${esc(a.name)}`, `${esc(a.category)} · S/N ${esc(a.serial_number || '—')} · ${esc(a.employee_name || 'Unassigned')} · ${esc(a.location || '')}${a.ip_address ? ` · IP ${esc(a.ip_address)}` : ''}`, badge(a.status))).join('')]);
  if (results.employees) groups.push(['Employees', 'users', results.employees.map((e) => row(`#/employees/${e.id}`, esc(e.full_name), `${esc(e.employee_code)} · ${esc(e.position || '')} · ${esc(e.department || '')} · ${e.asset_count} asset(s)`, badge(e.status))).join('')]);
  if (results.devices) groups.push(['Network devices', 'router', results.devices.map((d) => row(`#/devices/${d.id}`, esc(d.name), `${esc(d.device_type)} · ${esc(d.asset_tag || '')} · ${esc(d.ip_address || '')} · ${esc(d.location || '')}`, badge(d.status))).join('')]);
  if (results.networks) groups.push(['Networks', 'grid', results.networks.map((n) => row(`#/networks/${n.id}`, esc(n.name), `<span class="mono">${esc(n.cidr)}</span> · gateway ${esc(n.gateway || '—')} · ${esc(n.location || '')}`)).join('')]);
  if (results.isps) groups.push(['ISPs', 'globe', results.isps.map((i) => row('#/isps', `${esc(i.provider_name)} — ${esc(i.connection_name)}`, `${esc(i.public_ip || '')}`, `${badge(i.role)} ${badge(i.status)}`)).join('')]);
  if (results.locations) groups.push(['Locations', 'pin', results.locations.map((l) => row(`#/assets?location_id=${l.id}`, esc(l.name), `${esc([l.building, l.floor, l.room].filter(Boolean).join(' · '))} · ${l.asset_count} active asset(s)`)).join('')]);
  el.innerHTML = `<div class="page-head"><div><h1>Search results</h1><p>for “${esc(q)}”</p></div></div>
    ${groups.length ? groups.map(([t, ic, html]) => `<section class="card search-group"><div class="card-head"><h3 style="display:flex;gap:8px;align-items:center">${icon(ic).replace('<svg', '<svg width="16" height="16"')} ${t}</h3></div><div class="card-body flush">${html}</div></section>`).join('')
    : `<div class="card"><div class="empty-state">${q.length < 2 ? 'Type at least 2 characters' : 'No matches. Try an asset tag, serial number, employee name, IP, MAC address, device, ISP, network or location.'}</div></div>`}`;
}
