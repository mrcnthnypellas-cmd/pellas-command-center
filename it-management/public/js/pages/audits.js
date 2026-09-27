import { api, esc, badge, fmtDate, fmtDateTime, can, mountTable, setTitle, on, loadLookups, opt, openModal, formHtml, readForm, confirmDialog, toast, today } from '../core.js';
import { afterChange } from './actions.js';

export async function list(el) {
  setTitle('Inventory Audit');
  const L = await loadLookups();
  el.innerHTML = `<div class="page-head"><div><h1>Inventory Audits</h1><p>Physical counts: the system generates the expected asset list, you mark each one Found, Missing or Damaged.</p></div>
    <div class="page-actions">${can('audits.manage') ? '<button class="btn primary" data-new>+ New audit</button>' : ''}</div></div><section class="card" data-t></section>`;
  mountTable(el.querySelector('[data-t]'), {
    rows: await api.get('/audits'), rowHref: (a) => `#/audits/${a.id}`, empty: 'No audits yet',
    columns: [
      { key: 'name', label: 'Audit', render: (a) => `<b>${esc(a.name)}</b>` }, { key: 'audit_date', label: 'Date', render: (a) => fmtDate(a.audit_date) },
      { key: 'location', label: 'Location', render: (a) => esc(a.location || 'All locations') }, { key: 'department', label: 'Department', render: (a) => esc(a.department || 'All departments') },
      { key: 'total', label: 'Assets' },
      { key: 'progress', label: 'Progress', nosort: true, render: (a) => `<div class="progress" style="width:140px" title="${a.total - a.pending}/${a.total} checked"><span style="width:${(a.found / a.total) * 100}%;background:var(--green)"></span><span style="width:${(a.damaged / a.total) * 100}%;background:var(--amber)"></span><span style="width:${(a.missing / a.total) * 100}%;background:var(--red)"></span></div><div class="cell-sub">✓ ${a.found} · ✕ ${a.missing} · ⚠ ${a.damaged} · ${a.pending} pending</div>` },
      { key: 'created_by_name', label: 'Created by' }, { key: 'status', label: 'Status', render: (a) => badge(a.status) },
    ],
  });
  on(el, 'click', '[data-new]', () => openModal({
    title: 'New inventory audit',
    body: `<p class="muted" style="margin-top:0">All active assets matching the location/department are added to the checklist.</p>${formHtml([
      { name: 'name', label: 'Audit name', required: true, span: 2, placeholder: 'e.g. Q4 2026 Main Office Audit' },
      { name: 'audit_date', label: 'Audit date', type: 'date', value: today(), required: true },
      { name: 'location_id', label: 'Location', type: 'select', options: opt(L.locations), placeholder: 'All locations' },
      { name: 'department_id', label: 'Department', type: 'select', options: opt(L.departments), placeholder: 'All departments' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ])}`,
    submitLabel: 'Create & generate list',
    onSubmit: async (f) => { const r = await api.post('/audits', readForm(f)); toast('Audit created'); location.hash = `#/audits/${r.id}`; },
  }));
}

export async function detail(el, [id]) {
  const au = await api.get(`/audits/${id}`);
  setTitle(au.name);
  const open = au.status !== 'Completed' && can('audits.manage');
  const checked = au.total - au.pending;
  el.innerHTML = `<div class="crumbs"><a href="#/audits">Audits</a> / ${esc(au.name)}</div>
  <div class="page-head"><div><h1>${esc(au.name)}</h1><p>${fmtDate(au.audit_date, true)} · ${esc(au.location || 'All locations')} · ${esc(au.department || 'All departments')} ${badge(au.status)}</p></div>
    <div class="page-actions">${can('reports.export') ? `<a class="btn needs-pdf" href="/api/reports/audit?audit_id=${au.id}&format=pdf">Audit report (PDF)</a><a class="btn" href="/api/reports/audit?audit_id=${au.id}&format=csv">CSV</a>` : ''}
      ${open ? '<button class="btn primary" data-complete>Complete audit</button><button class="btn ghost" data-delete>Delete</button>' : ''}</div></div>
  <div class="stats" style="margin-bottom:16px">
    <div class="stat"><div class="label">Assets in scope</div><div class="value">${au.total}</div><div class="sub">${checked} checked</div></div>
    <div class="stat"><div class="label">✓ Found</div><div class="value" style="color:var(--green)">${au.found}</div></div>
    <div class="stat ${au.missing ? 'alert-bad' : ''}"><div class="label">✕ Missing</div><div class="value">${au.missing}</div></div>
    <div class="stat ${au.damaged ? 'alert-on' : ''}"><div class="label">⚠ Damaged</div><div class="value">${au.damaged}</div></div>
    <div class="stat"><div class="label">Pending</div><div class="value">${au.pending}</div></div></div>
  ${au.status === 'Completed' ? `<div class="alert info">Completed ${fmtDateTime(au.completed_at)}. Results were written to each asset's history.</div>` : ''}
  <section class="card" data-t></section>`;
  mountTable(el.querySelector('[data-t]'), {
    rows: au.items, pageSize: 200,
    columns: [
      { key: 'asset_tag', label: 'Asset Tag', render: (i) => `<a class="mono t-strong" href="#/assets/${i.asset_id}">${esc(i.asset_tag)}</a>` },
      { key: 'asset_name', label: 'Asset', render: (i) => `${esc(i.asset_name)}<div class="cell-sub">${esc(i.category)} · S/N ${esc(i.serial_number || '—')}</div>` },
      { key: 'expected_location', label: 'Expected location' }, { key: 'expected_employee', label: 'Expected holder' },
      { key: 'result', label: 'Result', render: (i) => badge(i.result) },
      { key: 'notes', label: 'Notes', render: (i) => (open ? `<input class="audit-note" data-note="${i.id}" value="${esc(i.notes || '')}" placeholder="Add note" style="width:100%;min-width:140px;border:1px solid var(--border);border-radius:6px;padding:4px 6px;background:var(--surface);color:var(--text)">` : esc(i.notes || '')) },
      { key: 'x', label: open ? 'Mark' : 'Checked', nosort: true, render: (i) => (open ? `<div class="btn-group audit-actions">
        <button class="btn xs" data-mark="Found" data-id="${i.id}" style="color:var(--green)">✓ Found</button>
        <button class="btn xs" data-mark="Missing" data-id="${i.id}" style="color:var(--red)">✕ Missing</button>
        <button class="btn xs" data-mark="Damaged" data-id="${i.id}" style="color:var(--amber)">⚠ Damaged</button></div>` : `<span class="cell-sub">${esc(i.checked_by_name || '')} ${i.checked_at ? fmtDateTime(i.checked_at) : ''}</span>`) },
    ],
  });
  on(el, 'click', '[data-mark]', async (_e, b) => {
    const note = el.querySelector(`[data-note="${b.dataset.id}"]`)?.value || '';
    await api.put(`/audits/${au.id}/items/${b.dataset.id}`, { result: b.dataset.mark, notes: note });
    window.dispatchEvent(new Event('itms:refresh'));
  });
  on(el, 'click', '[data-complete]', () => openModal({
    title: 'Complete audit',
    body: `<p>${au.pending ? `<b>${au.pending}</b> asset(s) are still pending and will be left unchanged.` : 'All assets have been checked.'}</p>
      <label class="check"><input type="checkbox" name="apply" checked> Update asset statuses (Missing → <b>Lost</b>, Damaged → <b>Damaged</b>)</label>`,
    submitLabel: 'Complete audit',
    onSubmit: async (f) => { await api.post(`/audits/${au.id}/complete`, { apply_statuses: f.apply.checked }); await afterChange('Audit completed — report ready'); },
  }));
  on(el, 'click', '[data-delete]', async () => {
    if (await confirmDialog('Delete audit', 'Delete this in-progress audit?', { confirmLabel: 'Delete' })) { await api.del(`/audits/${au.id}`); location.hash = '#/audits'; }
  });
}
