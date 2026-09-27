import { api, esc, fmtDate, setTitle, state, loadLookups, badge, debounce } from '../core.js';

export async function accountability(el, [id]) {
  const [e, company] = await Promise.all([api.get(`/employees/${id}`), api.get('/settings/company')]);
  setTitle(`Accountability — ${e.full_name}`);
  el.innerHTML = `<div class="print-toolbar"><a class="btn" href="#/employees/${e.id}">← Back</a><button class="btn primary" data-print>Print / Save as PDF</button></div>
  <div class="card print-page">
    <div class="company">${company.company_logo_url ? `<img src="${esc(company.company_logo_url)}" alt="" style="max-height:48px"><br>` : ''}<b style="font-size:16px">${esc(company.company_name || '')}</b><br>
      <span style="font-size:12px">${esc(company.company_address || '')}${company.company_phone ? ` · ${esc(company.company_phone)}` : ''}${company.company_email ? ` · ${esc(company.company_email)}` : ''}</span></div>
    <h1>EMPLOYEE ASSET ACKNOWLEDGEMENT</h1>
    <table style="margin-top:18px"><tbody>
      <tr><th style="width:22%">Employee</th><td>${esc(e.full_name)}</td><th style="width:18%">Employee ID</th><td>${esc(e.employee_code)}</td></tr>
      <tr><th>Department</th><td>${esc(e.department || '')}</td><th>Position</th><td>${esc(e.position || '')}</td></tr>
      <tr><th>Office / Location</th><td>${esc(e.location || '')}</td><th>Date</th><td>${fmtDate(new Date().toISOString().slice(0, 10), true)}</td></tr>
    </tbody></table>
    <p style="margin:18px 0 6px"><b>Assigned Assets</b> (${e.assets.length})</p>
    <table><thead><tr><th>#</th><th>Category</th><th>Asset</th><th>Asset Tag</th><th>Serial Number</th><th>Date Issued</th><th>Condition</th></tr></thead><tbody>
      ${e.assets.map((a, i) => { const asg = e.assignment_history.find((h) => h.asset_id === a.id && h.status === 'Active'); return `<tr><td>${i + 1}</td><td>${esc(a.category)}</td><td>${esc(a.name)}</td><td><b>${esc(a.asset_tag)}</b></td><td>${esc(a.serial_number || '')}</td><td>${fmtDate(a.assigned_date)}</td><td>${esc(asg?.condition_on_assign || '')}</td></tr>`; }).join('')
      || '<tr><td colspan="7" style="text-align:center">No assets currently assigned</td></tr>'}
    </tbody></table>
    <p style="font-size:12px;line-height:1.6;margin-top:14px">I acknowledge receipt of the company equipment listed above in the stated condition. I agree to use it for official business, take reasonable care of it,
      report loss or damage to IT/Admin immediately, and return all items upon request or at the end of my employment. I understand I may be held accountable for loss or damage caused by negligence.</p>
    <div class="sig-row"><div>Employee Signature over Printed Name<br><b>${esc(e.full_name)}</b></div><div>IT / Admin Signature over Printed Name<br><b>${esc(state.user.full_name)}</b></div></div>
    <div class="sig-row" style="margin-top:40px"><div>Date</div><div>Date</div></div>
  </div>`;
  el.querySelector('[data-print]').addEventListener('click', () => window.print());
}

const LABEL_PREFS = 'itms-label-prefs';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(LABEL_PREFS)) || {}; } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(LABEL_PREFS, JSON.stringify(p)); } catch { /* ignore */ } };
const isLocalhost = (u) => /\/\/(localhost|127\.|\[::1\])/i.test(u);

// Printable QR asset labels (stickers): pick assets, pick label stock, print or download an exact-size PDF.
export async function labels(el, _m, params) {
  setTitle('Asset QR labels');
  const [L, meta, company, allAssets] = await Promise.all([loadLookups(), api.get('/assets/labels/sizes'), api.get('/settings/company'), api.get('/assets')]);
  // Remember layout choices, but always start with no skipped labels.
  const prefs = { size: meta.sizes[0].key, mode: 'url', base: meta.default_base || location.origin, company: true, name: true, serial: false, cut: false, copies: 1, ...loadPrefs(), skip: 0 };
  const preselect = params.ids ? new Set(params.ids.split(',')) : null;
  const selected = new Set(allAssets.filter((a) => (preselect ? preselect.has(String(a.id)) : !['Retired', 'Disposed'].includes(a.status))).map((a) => String(a.id)));
  const filters = { q: '', category_id: '', location_id: '', status: preselect ? '' : 'active' };

  el.innerHTML = `<div class="page-head no-print"><div><div class="crumbs"><a href="#/assets">Assets</a> / QR labels</div><h1>Asset QR Labels</h1>
      <p>Print stickers with a QR code and the asset number, then stick them on each item. Scanning the QR opens the asset's profile.</p></div>
    <div class="page-actions"><button class="btn" type="button" data-print>Print labels</button><a class="btn primary needs-pdf" data-pdf href="#">Download PDF (exact size)</a></div></div>
  <div class="grid label-layout">
    <div class="stack no-print">
      <section class="card"><div class="card-head"><h3>Label paper</h3></div><div class="card-body">
        ${meta.sizes.map((z) => `<label class="radio-row"><input type="radio" name="size" value="${z.key}" ${z.key === prefs.size ? 'checked' : ''}><span><b>${esc(z.name)}</b><br><span class="cell-sub">${esc(z.hint)}</span></span></label>`).join('')}
        <div class="form-grid" style="margin-top:12px">
          <div class="field"><label for="lb-copies">Copies per asset</label><input id="lb-copies" type="number" min="1" max="20" value="${prefs.copies}"></div>
          <div class="field" data-skipwrap><label for="lb-skip">Skip used labels</label><input id="lb-skip" type="number" min="0" value="${prefs.skip}"><small class="help">Start after stickers already used on this sheet</small></div>
        </div></div></section>
      <section class="card"><div class="card-head"><h3>On each label</h3></div><div class="card-body">
        <label class="check"><input type="checkbox" id="lb-company" ${prefs.company ? 'checked' : ''}> Company name</label>
        <label class="check" style="margin-top:6px"><input type="checkbox" id="lb-name" ${prefs.name ? 'checked' : ''}> Asset name</label>
        <label class="check" style="margin-top:6px"><input type="checkbox" id="lb-serial" ${prefs.serial ? 'checked' : ''}> Serial number</label>
        <label class="check" style="margin-top:6px"><input type="checkbox" id="lb-cut" ${prefs.cut ? 'checked' : ''}> Cut lines (for plain paper)</label>
        <div class="field" style="margin-top:12px"><label for="lb-mode">QR code contains</label>
          <select id="lb-mode"><option value="url" ${prefs.mode === 'url' ? 'selected' : ''}>Link to the asset profile</option><option value="tag" ${prefs.mode === 'tag' ? 'selected' : ''}>Asset number only (e.g. LAP-0001)</option></select></div>
        <div class="field" data-basewrap style="margin-top:10px"><label for="lb-base">Link address of this system</label><input id="lb-base" value="${esc(prefs.base)}" placeholder="http://192.168.1.50:4000">
          <small class="help" data-basehelp></small></div>
        <p class="cell-sub" style="margin:10px 0 0">QR codes never contain passwords or credentials. Opening a link still requires signing in.</p>
      </div></section>
    </div>
    <div class="stack">
      <section class="card no-print"><div class="card-head"><h3>Assets to label</h3><span class="muted" data-count></span></div>
        <div class="filters">
          <div class="search-input"><input type="search" id="lb-q" placeholder="Search tag, name, serial…"></div>
          <select id="lb-cat"><option value="">All categories</option>${L.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
          <select id="lb-loc"><option value="">All locations</option>${L.locations.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
          <select id="lb-status"><option value="active" ${filters.status === 'active' ? 'selected' : ''}>Active assets</option><option value="" ${filters.status === '' ? 'selected' : ''}>All statuses</option><option value="unlabeled">Selected only</option></select>
        </div>
        <div style="display:flex;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);flex-wrap:wrap"><button class="btn xs" type="button" data-all>Select all shown</button><button class="btn xs" type="button" data-none>Clear selection</button></div>
        <div class="label-pick" data-list></div></section>
      <section class="card label-preview-card"><div class="card-head no-print"><h3>Preview (actual size)</h3><span class="muted" data-summary></span></div>
        <div class="card-body label-preview" data-preview></div></section>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const current = () => ({
    size: el.querySelector('input[name=size]:checked').value, mode: $('#lb-mode').value, base: $('#lb-base').value.trim(),
    company: $('#lb-company').checked, name: $('#lb-name').checked, serial: $('#lb-serial').checked, cut: $('#lb-cut').checked,
    copies: Math.min(Math.max(Number($('#lb-copies').value) || 1, 1), 20), skip: Math.max(Number($('#lb-skip').value) || 0, 0),
  });
  const qrSrc = (a, o) => `/api/assets/${a.id}/qr.svg?mode=${o.mode}&base=${encodeURIComponent(o.base)}`;

  const drawList = () => {
    const q = $('#lb-q').value.trim().toLowerCase();
    const cat = $('#lb-cat').value; const loc = $('#lb-loc').value; const st = $('#lb-status').value;
    const shown = allAssets.filter((a) => (!q || [a.asset_tag, a.name, a.serial_number].some((v) => v && v.toLowerCase().includes(q)))
      && (!cat || String(a.category_id) === cat) && (!loc || String(a.location_id) === loc)
      && (st === '' || (st === 'active' ? !['Retired', 'Disposed'].includes(a.status) : selected.has(String(a.id)))));
    $('[data-list]').innerHTML = shown.length ? `<table class="table"><tbody>${shown.map((a) => `<tr><td style="width:32px"><input type="checkbox" data-pick="${a.id}" ${selected.has(String(a.id)) ? 'checked' : ''} aria-label="Select ${esc(a.asset_tag)}"></td>
      <td><b class="mono">${esc(a.asset_tag)}</b></td><td>${esc(a.name)}</td><td class="cell-sub">${esc(a.location || '')}</td><td>${badge(a.status)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">No assets match</div>';
    $('[data-list]').dataset.shown = shown.map((a) => a.id).join(',');
    $('[data-count]').textContent = `${selected.size} selected`;
  };

  const drawPreview = () => {
    const o = current();
    savePrefs(o);
    const size = meta.sizes.find((z) => z.key === o.size);
    const sheet = size.cols * size.rows > 1;
    $('[data-skipwrap]').hidden = !sheet;
    $('[data-basewrap]').hidden = o.mode !== 'url';
    $('[data-basehelp]').innerHTML = o.mode === 'url' && isLocalhost(o.base)
      ? '<b style="color:var(--amber)">Phones can\'t open “localhost”.</b> Use this computer\'s network address (e.g. http://192.168.1.50:4000) and start the system with HOST=0.0.0.0.'
      : 'Phones on the same network open this address when they scan.';
    const picked = allAssets.filter((a) => selected.has(String(a.id)));
    const slots = [...Array(sheet ? Math.min(o.skip, size.cols * size.rows - 1) : 0).fill(null), ...picked.flatMap((a) => Array(o.copies).fill(a))];
    const perPage = size.cols * size.rows;
    const pages = [];
    for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage));
    const { w, h } = size.label;
    const k = h / 38.1;
    const label = (a, i) => {
      const x = size.left + (i % size.cols) * size.hPitch; const y = size.top + Math.floor(i / size.cols) * size.vPitch;
      const pos = `left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm`;
      if (!a) return `<div class="asset-label skipped" style="${pos}"></div>`;
      const pad = Math.min(2.2, h * 0.07); const side = h - 2 * pad;
      return `<div class="asset-label ${o.cut ? 'cut' : ''}" style="${pos};padding:${pad}mm;gap:${pad * 0.9}mm">
        <img src="${qrSrc(a, o)}" alt="QR ${esc(a.asset_tag)}" style="width:${side}mm;height:${side}mm">
        <div class="al-text" style="font-size:${Math.max(1.5, 2 * k)}mm">
          ${o.company && company.company_name && h >= 20 ? `<div class="al-company" style="font-size:${Math.max(1.5, 1.95 * k)}mm">${esc(company.company_name)}</div>` : ''}
          <div class="al-tag" style="font-size:${Math.max(2.9, 5.2 * k)}mm">${esc(a.asset_tag)}</div>
          ${o.name ? `<div class="al-name" style="font-size:${Math.max(1.6, 2.3 * k)}mm;-webkit-line-clamp:${h >= 25 ? 2 : 1}">${esc(a.name)}</div>` : ''}
          ${o.serial && a.serial_number ? `<div class="al-serial" style="font-size:${Math.max(1.5, 1.95 * k)}mm">S/N ${esc(a.serial_number)}</div>` : ''}
          ${h >= 29 && o.company ? `<div class="al-foot" style="font-size:${Math.max(1.4, 1.75 * k)}mm">Property of IT · Do not remove</div>` : ''}
        </div></div>`;
    };
    const count = picked.length * o.copies;
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    $('[data-summary]').textContent = picked.length
      ? `${plural(picked.length, 'asset')} · ${plural(count, 'label')} · ${plural(pages.length, sheet ? 'sheet' : 'sticker')}`
      : 'Select assets to label';
    $('[data-preview]').innerHTML = pages.length
      ? `<div class="label-pages">${pages.map((pg) => `<div class="label-page ${sheet ? '' : 'roll'}" style="width:${size.page.w}mm;height:${size.page.h}mm">${pg.map(label).join('')}</div>`).join('')}</div>`
      : '<div class="empty-state">Select one or more assets to see the labels.</div>';
    // Shrink the asset number until it fits the sticker; shorten the footer when space is tight.
    const overflows = (node) => { const r = document.createRange(); r.selectNodeContents(node); return r.getBoundingClientRect().width > node.getBoundingClientRect().width + 0.1; };
    $('[data-preview]').querySelectorAll('.al-tag').forEach((t) => {
      let fs = parseFloat(t.style.fontSize);
      while (overflows(t) && fs > 1.5) { fs -= 0.1; t.style.fontSize = `${fs}mm`; }
    });
    $('[data-preview]').querySelectorAll('.al-foot').forEach((f) => { if (overflows(f)) f.textContent = 'Property of IT'; });
    const ids = picked.map((a) => a.id).join(',');
    $('[data-pdf]').setAttribute('href', `/api/assets/labels.pdf?${new URLSearchParams({ ids, size: o.size, mode: o.mode, base: o.base, company: o.company ? 1 : 0, name: o.name ? 1 : 0, serial: o.serial ? 1 : 0, cut: o.cut ? 1 : 0, copies: o.copies, skip: o.skip })}`);
    $('[data-pdf]').classList.toggle('disabled', !picked.length);
    el.dataset.pageSize = `${size.page.w}mm ${size.page.h}mm`;
  };

  const debounced = debounce(drawPreview, 200);
  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-pick]')) { if (e.target.checked) selected.add(e.target.dataset.pick); else selected.delete(e.target.dataset.pick); $('[data-count]').textContent = `${selected.size} selected`; debounced(); return; }
    if (e.target.matches('#lb-q, #lb-cat, #lb-loc, #lb-status')) { drawList(); return; }
    debounced();
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-all]')) { ($('[data-list]').dataset.shown || '').split(',').filter(Boolean).forEach((id) => selected.add(id)); drawList(); drawPreview(); }
    if (e.target.closest('[data-none]')) { selected.clear(); drawList(); drawPreview(); }
    if (e.target.closest('[data-pdf].disabled')) { e.preventDefault(); e.stopPropagation(); }
    if (e.target.closest('[data-print]')) {
      // @page must match the label stock; added only while printing so other print pages keep normal margins.
      const st = document.createElement('style');
      st.textContent = `@media print { @page { size: ${el.dataset.pageSize}; margin: 0; } }`;
      document.head.appendChild(st);
      document.body.classList.add('printing-labels');
      const done = () => { st.remove(); document.body.classList.remove('printing-labels'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      window.print();
      setTimeout(done, 60000);
    }
  }, true);
  drawList();
  drawPreview();
}
