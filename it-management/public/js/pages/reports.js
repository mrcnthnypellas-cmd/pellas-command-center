import { api, esc, can, mountTable, setTitle, badge, loadLookups, opt, state } from '../core.js';
import { icon } from '../icons.js';

const BADGE_KEYS = new Set(['status', 'result', 'ip_type', 'role', 'warranty_status', 'resulting_status']);

export async function index(el) {
  setTitle('Reports');
  const list = await api.get('/reports');
  const groups = [...new Set(list.map((r) => r.group))];
  el.innerHTML = `<div class="page-head"><div><h1>Reports</h1><p>Print, export to PDF or Excel (CSV). Reports never include passwords or protected credentials.</p></div></div>
    ${groups.map((g) => `<div class="section-title">${esc(g)}</div><div class="grid g4">${list.filter((r) => r.group === g).map((r) => `<a class="stat" href="#/reports/${r.key}">
      <div class="label">${icon('chart').replace('<svg', '<svg width="14" height="14"')} ${esc(g)}</div><div style="font-weight:650;font-size:15px;margin-top:4px">${esc(r.title)}</div>
      <div class="sub">View · Print · PDF · CSV</div></a>`).join('')}</div>`).join('')}`;
}

export async function view(el, [key], params) {
  const L = await loadLookups();
  const q = new URLSearchParams(params).toString();
  const r = await api.get(`/reports/${key}${q ? `?${q}` : ''}`);
  setTitle(r.title);
  const exp = can('reports.export');
  const extra = key === 'history' ? `<select data-param="asset_id" style="height:36px;border-radius:8px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text)"><option value="">All assets</option>${opt(L.assets, 'id', (a) => `${a.asset_tag} — ${a.name}`).map((o) => `<option value="${o.value}" ${String(params.asset_id) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
    : key === 'audit' ? `<select data-param="audit_id" style="height:36px;border-radius:8px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text)"><option value="">All audits</option>${(await api.get('/audits')).map((a) => `<option value="${a.id}" ${String(params.audit_id) === String(a.id) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : '';
  el.innerHTML = `<div class="crumbs no-print"><a href="#/reports">Reports</a> / ${esc(r.title)}</div>
    <div class="page-head"><div><h1>${esc(r.title)}</h1><p>${esc(state.company?.name || '')} · generated ${new Date().toLocaleString()} · ${r.rows.length} record(s)</p></div>
    <div class="page-actions no-print">${extra}${exp ? `<button class="btn" data-print>${icon('printer').replace('<svg', '<svg width="15" height="15"')} Print</button>
      <a class="btn" href="/api/reports/${key}?format=pdf${q ? `&${q}` : ''}">${icon('download').replace('<svg', '<svg width="15" height="15"')} PDF</a>
      <a class="btn primary" href="/api/reports/${key}?format=csv${q ? `&${q}` : ''}">Excel / CSV</a>` : '<span class="muted">Export requires reports.export</span>'}</div></div>
    <section class="card" data-t></section>`;
  mountTable(el.querySelector('[data-t]'), {
    rows: r.rows, pageSize: 1000, empty: 'No records for this report',
    columns: r.columns.map((c) => ({ key: c.key, label: c.label, render: BADGE_KEYS.has(c.key) ? (row) => badge(row[c.key]) : undefined })),
  });
  el.querySelector('[data-print]')?.addEventListener('click', () => window.print());
  el.querySelector('[data-param]')?.addEventListener('change', (e) => {
    const v = e.target.value;
    location.hash = `#/reports/${key}${v ? `?${e.target.dataset.param}=${v}` : ''}`;
  });
}
