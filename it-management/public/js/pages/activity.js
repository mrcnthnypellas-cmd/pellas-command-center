import { api, esc, mountTable, setTitle, filterBar, debounce, qs, fmtDateTime, opt } from '../core.js';

const TYPES = ['asset', 'employee', 'ip', 'network', 'device', 'isp', 'wifi', 'credential', 'audit', 'user', 'role', 'report', 'settings', 'departments', 'locations', 'asset_categories'];

export async function render(el, _m, params) {
  setTitle('Activity Logs');
  el.innerHTML = `<div class="page-head"><div><h1>Activity Logs</h1><p>Who did what, and when. Passwords are never recorded — only that a credential was viewed or copied.</p></div></div>
    <section class="card">${filterBar([
    { type: 'search', name: 'q', placeholder: 'Search action, object, user…' },
    { name: 'entity_type', label: 'All objects', options: opt(TYPES) },
    { name: 'security', label: 'All events', options: [{ value: '1', label: 'Security events only' }] },
  ], params)}<div class="filters" style="border-top:0;padding-top:0"><label class="muted">From <input type="date" name="from" value="${esc(params.from || '')}"></label><label class="muted">To <input type="date" name="to" value="${esc(params.to || '')}"></label></div><div data-t></div></section>`;
  const table = mountTable(el.querySelector('[data-t]'), {
    rows: [], pageSize: 100,
    columns: [
      { key: 'created_at', label: 'Date & time', render: (a) => `<span class="nowrap">${fmtDateTime(a.created_at)}</span>`, sort: (a) => a.id },
      { key: 'user_name', label: 'User', render: (a) => `<b>${esc(a.user_name || 'System')}</b>` },
      { key: 'action', label: 'Action' },
      { key: 'entity_type', label: 'Object type', render: (a) => `<span class="cell-sub">${esc(a.entity_type || '')}</span>` },
      { key: 'entity_label', label: 'Object', render: (a) => esc(a.entity_label || '') },
      { key: 'details', label: 'Details', render: (a) => { if (!a.details) return ''; try { return `<span class="cell-sub">${Object.entries(JSON.parse(a.details)).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ')}</span>`; } catch { return esc(a.details); } } },
      { key: 'ip_address', label: 'IP', render: (a) => `<span class="mono cell-sub">${esc(a.ip_address || '')}</span>` },
    ],
  });
  const load = async () => {
    const f = {};
    el.querySelectorAll('.filters [name]').forEach((x) => { if (x.value) f[x.name] = x.value; });
    history.replaceState(null, '', `#/activity${qs(f)}`);
    table.update(await api.get(`/activity${qs(f)}`));
  };
  el.querySelectorAll('.filters').forEach((x) => x.addEventListener('input', debounce(load)));
  await load();
}
