// Asset list import (Excel/CSV → check → import) and export.
import { api, esc, badge, can, mountTable, setTitle, on, toast, loadLookups, opt } from '../core.js';
import { icon } from '../icons.js';

const ACTION = {
  create: ['New', 'green'], update: ['Update', 'blue'], unchanged: ['No change', 'gray'], skip: ['Skipped', 'gray'], error: ['Error', 'red'],
};
const ico = (n) => icon(n).replace('<svg', '<svg width="15" height="15"');

export async function page(el) {
  setTitle('Import & Export Assets');
  const canImport = can('assets.create') || can('assets.edit');
  const canExport = can('reports.export');
  const L = await loadLookups();
  el.innerHTML = `<div class="page-head"><div><div class="crumbs"><a href="#/assets">Assets</a> / Import &amp; Export</div><h1>Import &amp; Export Assets</h1>
    <p>Bring in your existing asset list from Excel, or download the list to edit and import back. Exports use the same columns as imports.</p></div></div>
  <div class="grid split-2-1">
    <div class="stack">
      ${canImport ? `<section class="card"><div class="card-head"><h3>1 · Get the template</h3><span class="muted">optional if you already have a list</span></div><div class="card-body">
        <p class="only-no-xlsx" style="margin-top:0">Download the CSV template and fill it in (Excel or Google Sheets can open it), then save it as CSV and upload it below. Your own list works too if its column names are similar (“Serial No.”, “Item Name”, “Dept”, …).</p>
        <p class="needs-xlsx" style="margin-top:0">The Excel template has drop-down lists for Category, Status, Department, Location and employees, plus an instructions sheet. Your own spreadsheet works too if its column names are similar (“Serial No.”, “Item Name”, “Dept”, …).</p>
        <div class="btn-group"><a class="btn needs-xlsx" href="/api/assets/import/template">${ico('download')} Excel template (.xlsx)</a><a class="btn" href="/api/assets/import/template?format=csv">CSV template</a></div>
      </div></section>
      <form class="card" data-upload novalidate><div class="card-head"><h3>2 · Upload and check</h3></div><div class="card-body">
        <div class="field"><label for="imp-file"><span class="needs-xlsx">Excel (.xlsx) or </span>CSV file · up to 2,000 rows</label><input id="imp-file" type="file" name="file" accept=".xlsx,.csv,text/csv"></div>
        <div style="margin-top:14px"><label class="radio-row"><input type="radio" name="mode" value="upsert" checked><span><b>Add new assets and update existing ones</b><br><span class="cell-sub">Rows whose Asset Tag already exists update that asset. Empty cells keep the current value.</span></span></label>
          <label class="radio-row"><input type="radio" name="mode" value="create_only"><span><b>Add new assets only</b><br><span class="cell-sub">Rows with an existing Asset Tag are skipped.</span></span></label></div>
        <label class="check" style="margin-top:6px"><input type="checkbox" name="create_lookups" checked> Create departments and locations that don't exist yet</label>
        <p class="cell-sub" style="margin:10px 0 0">Nothing is saved at this step. You'll see what will happen to every row first.</p>
      </div><div class="form-actions"><button class="btn primary" type="submit">Check file</button></div></form>` : ''}
      <div data-review></div>
    </div>
    <div class="stack">
      ${canExport ? `<section class="card"><div class="card-head"><h3>Export asset list</h3></div><div class="card-body">
        <div class="form-grid" style="grid-template-columns:1fr">
          <div class="field"><label for="exp-status">Status</label><select id="exp-status"><option value="">All statuses</option>${['Available', 'Deployed', 'Under Repair', 'Damaged', 'Lost', 'Retired', 'Disposed'].map((s) => `<option>${s}</option>`).join('')}</select></div>
          <div class="field"><label for="exp-cat">Category</label><select id="exp-cat"><option value="">All categories</option>${opt(L.categories).map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></div>
          <div class="field"><label for="exp-loc">Location</label><select id="exp-loc"><option value="">All locations</option>${opt(L.locations).map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></div>
        </div>
        <div class="btn-group" style="margin-top:14px"><a class="btn primary needs-xlsx" data-exp="xlsx" href="/api/assets/export">${ico('download')} Excel (.xlsx)</a><a class="btn" data-exp="csv" href="/api/assets/export?format=csv">CSV</a></div>
        <p class="cell-sub" style="margin:10px 0 0">Includes assigned employee and IP for reference. Never includes passwords or credentials.</p>
      </div></section>` : ''}
      <section class="card"><div class="card-head"><h3>Columns</h3></div><div class="card-body" style="font-size:13px">
        <p style="margin-top:0"><b>Required for new assets:</b> Asset Name, Category.</p>
        <p><b>Asset Tag:</b> leave empty to number automatically (e.g. LAP-0007). Fill it in to update that asset.</p>
        <p><b>Assigned To:</b> Employee ID (EMP-001) or full name. The asset is deployed to them and appears on their profile.</p>
        <p style="margin-bottom:0"><b>Dates:</b> 2026-01-05, 01/05/2026 or Jan 5, 2026. <b>Cost:</b> 68500 or ₱68,500.00.</p>
      </div></section>
    </div>
  </div>`;

  // Export links follow the chosen filters.
  const expLinks = () => {
    const q = new URLSearchParams();
    const st = el.querySelector('#exp-status')?.value; const cat = el.querySelector('#exp-cat')?.value; const loc = el.querySelector('#exp-loc')?.value;
    if (st) q.set('status', st); if (cat) q.set('category_id', cat); if (loc) q.set('location_id', loc);
    el.querySelectorAll('[data-exp]').forEach((a) => {
      const p = new URLSearchParams(q); if (a.dataset.exp === 'csv') p.set('format', 'csv');
      a.setAttribute('href', `/api/assets/export${p.toString() ? `?${p}` : ''}`);
    });
  };
  el.addEventListener('change', (e) => { if (e.target.matches('#exp-status, #exp-cat, #exp-loc')) expLinks(); });

  const form = el.querySelector('[data-upload]');
  if (!form) return;
  const review = el.querySelector('[data-review]');
  let lastFile = null;
  const send = async (commit) => {
    const fd = new FormData();
    fd.append('file', lastFile);
    fd.append('mode', form.querySelector('input[name=mode]:checked').value);
    fd.append('create_lookups', form.create_lookups.checked ? '1' : '0');
    if (commit) fd.append('commit', '1');
    return api.form('POST', '/assets/import', fd);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.querySelector('#imp-file').files[0];
    if (!f) { toast('Choose a file first', 'err'); return; }
    lastFile = f;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Checking…';
    try { showReview(await send(false)); } catch (ex) {
      review.innerHTML = `<section class="card"><div class="card-body"><div class="alert err" style="margin:0">${esc(ex.message)}</div></div></section>`;
    } finally { btn.disabled = false; btn.textContent = 'Check file'; }
  });
  form.addEventListener('change', (e) => { if (e.target.matches('input[name=mode], input[name=create_lookups]') && lastFile) form.requestSubmit(); });

  function showReview(res) {
    const S = res.summary;
    const ready = S.create + S.update;
    const pill = (n, label, tone, filter) => `<button type="button" class="stat" data-filter="${filter}" style="text-align:left;cursor:pointer;font:inherit"><div class="label"><span class="dot" style="background:var(--${tone})"></span>${label}</div><div class="value">${n}</div></button>`;
    review.innerHTML = `<section class="card"><div class="card-head"><h3>3 · Review and import</h3><span class="muted">${esc(lastFile.name)} · ${S.total} row${S.total === 1 ? '' : 's'}</span></div>
      <div class="card-body">
        <div class="stats" style="grid-template-columns:repeat(auto-fill,minmax(118px,1fr))">
          ${pill(S.create, 'New', 'green', 'create')}${pill(S.update, 'Updates', 'blue', 'update')}${pill(S.unchanged, 'No change', 'gray', 'unchanged')}
          ${S.skip ? pill(S.skip, 'Skipped', 'gray', 'skip') : ''}${pill(S.errors, 'Errors', 'red', 'error')}</div>
        <p class="cell-sub" style="margin:12px 0 0">Columns used: ${res.columns.recognized.map(esc).join(', ')}${res.columns.ignored.length ? `. <b>Ignored:</b> ${res.columns.ignored.map(esc).join(', ')}` : ''}.</p>
        ${res.new_lookups.departments.length || res.new_lookups.locations.length ? `<p class="cell-sub" style="margin:6px 0 0">Will be created: ${[...res.new_lookups.departments.map((d) => `department “${esc(d)}”`), ...res.new_lookups.locations.map((l) => `location “${esc(l)}”`)].join(', ')}.</p>` : ''}
      </div>
      <div class="filters" data-filters><div class="pill-tabs">${[['all', 'All rows'], ['problems', 'Errors & warnings'], ['create', 'New'], ['update', 'Updates']].map(([k, l], i) => `<button type="button" data-f="${k}" class="${i === 0 ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      <div data-rows></div>
      <div class="form-actions" style="justify-content:space-between;align-items:center"><span class="cell-sub">${S.errors ? `${S.errors} row${S.errors === 1 ? '' : 's'} with errors will be skipped. Fix them in your file and import it again.` : 'No errors found.'}</span>
        <button class="btn primary" type="button" data-commit ${ready ? '' : 'disabled'}>${ready ? `Import ${ready} asset${ready === 1 ? '' : 's'}` : 'Nothing to import'}</button></div></section>`;
    const rows = res.rows.map((r) => ({ ...r, result: r.errors.length ? 'error' : r.action }));
    const table = mountTable(review.querySelector('[data-rows]'), {
      rows, pageSize: 100, empty: 'No rows in this view',
      columns: [
        { key: 'row', label: 'Row', render: (r) => `<span class="cell-sub">${r.row}</span>` },
        { key: 'result', label: 'Result', render: (r) => badge(ACTION[r.result][0], ACTION[r.result][1]) },
        { key: 'asset_tag', label: 'Asset Tag', render: (r) => (r.asset_tag ? `<span class="mono t-strong">${esc(r.asset_tag)}</span>${r.auto_tag ? '<div class="cell-sub">auto</div>' : ''}` : '<span class="muted">—</span>') },
        { key: 'name', label: 'Asset', render: (r) => `${esc(r.name || '')}${r.category ? `<div class="cell-sub">${esc(r.category)}</div>` : ''}` },
        { key: 'changes', label: 'What will happen', nosort: true, render: (r) => [
          r.action === 'update' && r.changes.length ? `Update ${r.changes.map(esc).join(', ')}` : '',
          r.assign_to ? `Assign to ${esc(r.assign_to)}` : '',
        ].filter(Boolean).join('<br>') || '<span class="muted">—</span>' },
        { key: 'problems', label: 'Problems', nosort: true, render: (r) => [...r.errors.map((m) => `<div style="color:var(--red)">✕ ${esc(m)}</div>`), ...r.warnings.map((m) => `<div style="color:var(--amber)">⚠ ${esc(m)}</div>`)].join('') || '<span class="muted">—</span>' },
      ],
    });
    const applyFilter = (k) => {
      review.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('active', b.dataset.f === k));
      table.update(k === 'all' ? rows : k === 'problems' ? rows.filter((r) => r.errors.length || r.warnings.length) : rows.filter((r) => r.result === k));
    };
    on(review, 'click', '[data-f]', (_e, b) => applyFilter(b.dataset.f));
    on(review, 'click', '[data-filter]', (_e, b) => {
      const k = b.dataset.filter;
      applyFilter(['create', 'update'].includes(k) ? k : k === 'error' ? 'problems' : 'all');
    });
    on(review, 'click', '[data-commit]', async (_e, b) => {
      b.disabled = true; b.textContent = 'Importing…';
      try {
        const done = await send(true);
        const R = done.result;
        await loadLookups(true);
        review.innerHTML = `<section class="card"><div class="card-head"><h3>Import finished</h3><span class="muted">${esc(lastFile.name)}</span></div><div class="card-body">
          <div class="stats" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">
            <div class="stat"><div class="label">Added</div><div class="value">${R.created}</div></div><div class="stat"><div class="label">Updated</div><div class="value">${R.updated}</div></div>
            <div class="stat"><div class="label">Assigned to employees</div><div class="value">${R.assigned}</div></div>${R.failed ? `<div class="stat alert-bad"><div class="label">Failed</div><div class="value">${R.failed}</div></div>` : ''}</div>
          ${R.failed ? `<div class="alert err" style="margin-top:12px">${done.rows.filter((r) => r.errors.length && ['create', 'update'].includes(r.action)).map((r) => `Row ${r.row}: ${esc(r.errors.join('; '))}`).join('<br>')}</div>` : ''}
          <p style="margin-bottom:0">Each imported asset's history records the import. You can print QR stickers for them next.</p></div>
          <div class="form-actions"><button class="btn" type="button" data-again>Import another file</button><a class="btn" href="#/print/labels?ids=${done.rows.filter((r) => r.asset_id).map((r) => r.asset_id).join(',')}">${ico('qr')} Print QR labels for these</a><a class="btn primary" href="#/assets">View assets</a></div></section>`;
        toast(`Imported: ${R.created} added, ${R.updated} updated`);
        review.querySelector('[data-again]').addEventListener('click', () => { form.reset(); lastFile = null; review.innerHTML = ''; window.scrollTo({ top: 0, behavior: 'smooth' }); });
      } catch (ex) { toast(ex.message, 'err'); b.disabled = false; b.textContent = `Import ${ready} asset${ready === 1 ? '' : 's'}`; }
    });
    review.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
