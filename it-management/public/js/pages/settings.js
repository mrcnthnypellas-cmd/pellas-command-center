import { api, esc, badge, can, mountTable, setTitle, on, openModal, formHtml, readForm, formData, opt, confirmDialog, toast, fmtDateTime, state, kv, card, resolveImage } from '../core.js';
import { afterChange } from './actions.js';
import { applyBranding } from './branding.js';

export async function render(el, _m, params) {
  setTitle('Settings');
  const tabs = [
    can('settings.manage') && ['appearance', 'Appearance'],
    can('settings.manage') && ['company', 'Company'],
    can('settings.manage') && ['departments', 'Departments'],
    can('settings.manage') && ['locations', 'Locations'],
    can('settings.manage') && ['categories', 'Asset Categories'],
    can('settings.manage') && ['numbering', 'Numbering & Alerts'],
    can('users.manage') && ['users', 'Users'],
    can('users.manage') && ['roles', 'Roles & Permissions'],
    can('settings.manage') && can('users.manage') && ['backup', 'Backup & Restore'],
    can('settings.manage') && ['license', 'License'],
    ['system', 'System'],
  ].filter(Boolean);
  const tab = tabs.find((t) => t[0] === params.tab) ? params.tab : tabs[0][0];
  el.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Company profile, lookup lists, numbering, users and permissions.</p></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div><div data-pane></div>`;
  el.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) location.hash = `#/settings?tab=${b.dataset.tab}`; });
  const pane = el.querySelector('[data-pane]');
  await PANES[tab](pane);
}

const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

const PANES = {
  async license(el) {
    const L = await api.get('/license');
    const tone = L.state === 'valid' ? (L.warn ? 'amber' : 'green') : 'red';
    const label = { valid: L.warn ? 'Expiring soon' : 'Active', expired: 'Expired', missing: 'No license', invalid: 'Invalid key', clock: 'Check the computer date' }[L.state] || L.state;
    el.innerHTML = `<div class="grid split-2-1"><section class="card"><div class="card-head"><h3>License</h3>${badge(label, tone)}</div><div class="card-body">
        ${L.licensee ? `<dl class="license-facts">
          <dt>Licensed to</dt><dd>${esc(L.licensee)}</dd>
          <dt>Valid until</dt><dd>${esc(L.expires)}${L.state === 'valid' ? ` <span class="muted" style="font-weight:400">(${L.days_left} day(s) left)</span>` : ''}</dd>
          ${L.issued ? `<dt>Issued</dt><dd>${esc(L.issued)}</dd>` : ''}
          ${L.id ? `<dt>Key ID</dt><dd class="mono">${esc(L.id)}</dd>` : ''}
        </dl>` : '<p class="muted" style="margin:0">No license key has been entered.</p>'}
      </div></section>
      <form class="card" data-renew novalidate><div class="card-head"><h3>Enter a new or renewed key</h3></div><div class="card-body">
        <div class="field"><label for="renew-key">License key</label><textarea id="renew-key" name="key" rows="4" class="license-input" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="ITMS1.…"></textarea></div>
        <p class="cell-sub" style="margin:8px 0 0">The new key replaces the current one right away. Your data isn't affected.</p>
      </div><div class="form-actions"><button class="btn primary" type="submit">Activate key</button></div></form></div>`;
    const f = el.querySelector('[data-renew]');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const s = await api.post('/license', { key: f.elements.key.value });
        state.user.license = s;
        toast(`License active until ${s.expires}`);
        window.dispatchEvent(new Event('itms:license'));
      } catch (ex) { toast(ex.message, 'err'); }
    });
  },
  async backup(el) {
    const st = await api.get('/backup/status');
    el.innerHTML = `<div class="grid split-2-1">
      <div class="stack">
        <form class="card" data-make novalidate><div class="card-head"><h3>Create a backup</h3><span class="muted">Last backup: ${esc(fmtWhen(st.last_backup_at))}</span></div><div class="card-body">
          <p style="margin-top:0">Downloads <b>one file</b> with everything in this system: assets, employees, assignments and history, IPs, networks, ISPs, maintenance, audits, users and permissions, settings, saved passwords, and all uploaded photos and documents.</p>
          <div class="alert warn">The file contains your saved passwords, so it is locked with a <b>backup password</b>. You'll need it to restore. It can't be recovered if forgotten.</div>
          ${formHtml([
            { name: 'password', label: 'Backup password (min 8 characters)', type: 'password', required: true },
            { name: 'confirm', label: 'Type it again', type: 'password', required: true },
          ])}
        </div><div class="form-actions"><button class="btn primary" type="submit">Download backup</button></div></form>

        <form class="card" data-restore novalidate><div class="card-head"><h3>Restore from a backup</h3><span class="muted">Last restore: ${esc(fmtWhen(st.last_restore_at))}</span></div><div class="card-body">
          <div class="alert err">Restoring <b>replaces everything</b> in this system with the backup's data, including users. A safety copy of the current data is saved first in the <code>data/backups</code> folder.</div>
          ${formHtml([
            { name: 'file', label: 'Backup file (.itmsbackup)', type: 'file', accept: '.itmsbackup', span: 2 },
            { name: 'password', label: 'Backup password', type: 'password', required: true, span: 2 },
          ])}
          <div data-check-result></div>
        </div><div class="form-actions"><button class="btn" type="submit">Check backup</button></div></form>
      </div>
      <section class="card"><div class="card-head"><h3>Moving to another PC</h3></div><div class="card-body">
        <ol class="steps">
          <li><b>On this PC:</b> create a backup and copy the file to a USB drive or shared folder.</li>
          <li><b>On the new PC:</b> install and start the system (<code>npm install</code>, then <code>npm start</code>).</li>
          <li>Sign in with the default admin account, then open <b>Settings → Backup &amp; Restore</b>.</li>
          <li>Choose the backup file, enter the backup password, check it, then restore.</li>
          <li>Sign in again with your usual accounts. Everything is there.</li>
        </ol>
        <p class="cell-sub" style="margin-bottom:0">Tip: make a backup regularly (for example every Friday) and keep a copy off this PC.</p>
      </div></section>
    </div>
    <form class="card danger-zone" data-erase novalidate style="margin-top:16px"><div class="card-head"><h3>Start fresh (erase data)</h3></div><div class="card-body">
      <p style="margin-top:0">Removes the records so you can start from zero, for example to clear the sample data. <b>Your own account (${esc(state.user.username)})</b>, roles, asset categories and settings stay.</p>
      <div data-erase-counts class="cell-sub" style="margin-bottom:12px">Counting records…</div>
      <div class="alert err">This can't be undone. <b>Create a backup first</b> if you might need this data again.</div>
      <div class="erase-options">
        <label class="check"><input type="checkbox" name="locations" checked> Also erase locations</label>
        <label class="check"><input type="checkbox" name="departments"> Also erase departments</label>
        <label class="check"><input type="checkbox" name="users" checked> Also remove the other user accounts</label>
      </div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label for="erase-pw">Your password</label><input id="erase-pw" name="password" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="erase-confirm">Type <b>ERASE</b> to confirm</label><input id="erase-confirm" name="confirm" autocomplete="off" autocapitalize="characters"></div>
      </div>
    </div><div class="form-actions"><button class="btn danger" type="submit">Erase data and start fresh</button></div></form>`;

    const eraseForm = el.querySelector('[data-erase]');
    api.get('/backup/erase-preview').then((c) => {
      const parts = [['assets', c.assets], ['employees', c.employees], ['IP addresses', c.ip_addresses], ['network devices', c.network_devices], ['ISPs', c.isps], ['saved passwords', c.credentials], ['phone contacts', c.phone_contacts], ['other users', c.other_users]];
      eraseForm.querySelector('[data-erase-counts]').textContent = `Now in the system: ${parts.map(([l, n]) => `${n} ${l}`).join(' · ')}`;
    }).catch(() => { eraseForm.querySelector('[data-erase-counts]').textContent = ''; });
    eraseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = eraseForm.elements;
      if (f.confirm.value.trim().toUpperCase() !== 'ERASE') { toast('Type ERASE to confirm', 'err'); f.confirm.focus(); return; }
      if (!f.password.value) { toast('Enter your password', 'err'); f.password.focus(); return; }
      const ok = await confirmDialog('Erase all data?', 'Every asset, employee, IP address, network device, ISP, saved password, phone contact and log will be deleted. This cannot be undone.', { confirmLabel: 'Erase everything' });
      if (!ok) return;
      const btn = eraseForm.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Erasing…';
      try {
        const r = await api.post('/backup/erase', { password: f.password.value, confirm: 'ERASE', locations: f.locations.checked, departments: f.departments.checked, users: f.users.checked });
        toast(`Done. ${r.erased.assets} assets and ${r.erased.employees} employees were erased. You can start adding your own data.`);
        location.hash = '#/dashboard';
      } catch (ex) { toast(ex.message, 'err'); } finally { btn.disabled = false; btn.textContent = 'Erase data and start fresh'; }
    });

    const make = el.querySelector('[data-make]');
    make.addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = readForm(make);
      if (b.password.length < 8) { toast('The backup password must be at least 8 characters', 'err'); return; }
      if (b.password !== b.confirm) { toast('The two passwords do not match', 'err'); return; }
      const btn = make.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Preparing backup…';
      try {
        const res = await fetch('/api/backup/download', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'itms', 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Backup failed');
        const name = (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'backup.itmsbackup';
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        make.reset();
        toast(`Backup saved: ${name}`);
      } catch (ex) { toast(ex.message, 'err'); } finally { btn.disabled = false; btn.textContent = 'Download backup'; }
    });

    const rf = el.querySelector('[data-restore]');
    const out = rf.querySelector('[data-check-result]');
    const send = async (path, extra = {}) => {
      const f = rf.querySelector('input[type=file]').files[0];
      if (!f) throw new Error('Choose a backup file');
      const fd = new FormData();
      fd.append('file', f); fd.append('password', rf.querySelector('input[name=password]').value);
      for (const [k, v] of Object.entries(extra)) fd.append(k, v);
      return api.form('POST', `/backup/${path}`, fd);
    };
    // Clear old results only when another file is picked (clearing on every change shifts the button away mid-click).
    rf.querySelector('input[type=file]').addEventListener('change', () => { out.innerHTML = ''; });
    rf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = rf.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Checking…';
      try {
        const { summary: S } = await send('check');
        const C = S.counts;
        out.innerHTML = `<div class="backup-summary"><div><b>Backup is valid.</b> ${esc(S.company_name || '')} · made ${esc(fmtWhen(S.created_at))}</div>
          <div class="backup-counts">${[['Assets', C.assets], ['Employees', C.employees], ['Assignments', C.asset_assignments], ['IP addresses', C.ip_addresses], ['Network devices', C.network_devices], ['ISPs', C.isps], ['Saved passwords', C.credentials + C.wifi_networks], ['Users', C.users], ['Files', S.files]]
            .map(([l, n]) => `<span><b>${n}</b> ${l}</span>`).join('')}</div>
          <div class="field" style="margin-top:12px"><label for="restore-confirm">Type <b>RESTORE</b> to replace this system's data with this backup</label><input id="restore-confirm" autocomplete="off" autocapitalize="characters"></div>
          <button type="button" class="btn danger" data-go style="margin-top:10px" disabled>Restore now</button></div>`;
        const input = out.querySelector('#restore-confirm');
        const go = out.querySelector('[data-go]');
        input.addEventListener('input', () => { go.disabled = input.value.trim() !== 'RESTORE'; });
        go.addEventListener('click', async () => {
          go.disabled = true; go.textContent = 'Restoring…';
          try {
            const r = await send('restore', { confirm: 'RESTORE' });
            openModal({
              title: 'Restore complete',
              body: `<p style="margin-top:0">This system now has the data from the backup made ${esc(fmtWhen(r.summary.created_at))}.</p>
                <p>Sign in again with an account from the backup. A copy of the previous data was saved in <code>${esc(r.safety_copy)}</code>.</p>`,
              submitLabel: 'Go to sign-in',
              onSubmit: () => { location.hash = '#/dashboard'; location.reload(); },
            });
          } catch (ex) { toast(ex.message, 'err'); go.disabled = false; go.textContent = 'Restore now'; }
        });
      } catch (ex) { out.innerHTML = `<div class="alert err" style="margin:12px 0 0">${esc(ex.message)}</div>`; } finally { btn.disabled = false; btn.textContent = 'Check backup'; }
    });
  },
  async appearance(el) {
    const b = await api.get('/settings/branding');
    [b.login_bg_url, b.logo_url] = await Promise.all([resolveImage(b.login_bg_url), resolveImage(b.logo_url)]);
    let photoUrl = b.login_bg_url;
    let removePhoto = false;
    el.innerHTML = `<div class="grid split-2-1">
      <div class="stack">
        <form class="card" data-names novalidate><div class="card-head"><h3>Names</h3></div><div class="card-body">${formHtml([
          { name: 'company_name', label: 'Company name', required: true, value: b.company_name, attrs: 'maxlength="80"' },
          { name: 'system_name', label: 'System name', required: true, value: b.system_name, attrs: 'maxlength="60"' },
          { name: 'dashboard_title', label: 'Dashboard title', required: true, value: b.dashboard_title, attrs: 'maxlength="60"' },
          { name: 'dashboard_subtitle', label: 'Dashboard description', value: b.dashboard_subtitle, attrs: 'maxlength="200"' },
        ])}</div><div class="form-actions"><button class="btn primary" type="submit">Save names</button></div></form>
        <form class="card" data-login novalidate><div class="card-head"><h3>Sign-in page</h3></div><div class="card-body">
          <div class="field"><label>Background colour</label><div class="swatches">${Object.entries(b.presets).map(([k, label]) => `<label class="swatch login-wrap bg-${k}" title="${esc(label)}"><input type="radio" name="login_bg_preset" value="${k}" ${k === b.login_bg_preset ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>
            <small class="help">Used behind the photo too, while it loads, and when there's no photo.</small></div>
          <div class="field" style="margin-top:14px"><label for="bg-file">Background photo (optional)</label><input id="bg-file" type="file" name="login_bg" accept="image/png,image/jpeg,image/webp">
            <small class="help">A wide photo works best (e.g. your office or building), at least 1600 px wide, under 5 MB. It's darkened slightly so the sign-in box stays readable.</small>
            <div style="margin-top:8px" data-photo-actions></div></div>
          <div class="field" style="margin-top:14px"><label for="login-msg">Message under the company name</label><input id="login-msg" name="login_message" maxlength="200" value="${esc(b.login_message)}"></div>
        </div><div class="form-actions"><button class="btn primary" type="submit">Save sign-in page</button></div></form>
      </div>
      <section class="card"><div class="card-head"><h3>Preview</h3><span class="muted">sign-in page</span></div><div class="card-body"><div class="login-preview" data-preview></div></div></section>
    </div>`;
    const loginForm = el.querySelector('[data-login]');
    const preview = () => {
      const preset = loginForm.querySelector('input[name=login_bg_preset]:checked').value;
      const photo = removePhoto ? null : photoUrl;
      el.querySelector('[data-preview]').innerHTML = `<div class="login-wrap bg-${preset} ${photo ? 'has-photo' : ''}">${photo ? `<img class="login-bg" src="${esc(photo)}" alt="">` : ''}
        <div class="login-card"><div class="brand-logo" style="width:30px;height:30px;color:#fff;font-size:11px">${b.logo_url ? `<img src="${esc(b.logo_url)}" alt="">` : 'IT'}</div>
        <b>${esc(el.querySelector('[data-names] [name=company_name]').value)}</b><div class="muted">${esc(el.querySelector('[data-names] [name=system_name]').value)}</div>
        <div class="login-message">${esc(loginForm.login_message.value)}</div><div class="pv-field"></div><div class="pv-field"></div><div class="pv-btn">Sign in</div></div></div>`;
      el.querySelector('[data-photo-actions]').innerHTML = photo ? '<button type="button" class="btn sm" data-remove-photo>Remove photo</button>' : '';
    };
    el.addEventListener('input', preview);
    loginForm.querySelector('#bg-file').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast('Choose a PNG, JPG or WebP image', 'err'); e.target.value = ''; return; }
      photoUrl = URL.createObjectURL(f); removePhoto = false; preview();
    });
    on(el, 'click', '[data-remove-photo]', () => { removePhoto = true; loginForm.querySelector('#bg-file').value = ''; preview(); });
    el.querySelector('[data-names]').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await applyBranding(await api.put('/settings/branding', readForm(e.target))); setTitle('Settings'); toast('Names saved'); } catch (ex) { toast(ex.message, 'err'); }
    });
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData();
      fd.append('login_bg_preset', loginForm.querySelector('input[name=login_bg_preset]:checked').value);
      fd.append('login_message', loginForm.login_message.value);
      const f = loginForm.querySelector('#bg-file').files[0];
      if (f && !removePhoto) fd.append('login_bg', f);
      if (removePhoto) fd.append('remove_login_bg', '1');
      const btn = loginForm.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const nb = await api.form('PUT', '/settings/branding', fd);
        photoUrl = await resolveImage(nb.login_bg_url); removePhoto = false; loginForm.querySelector('#bg-file').value = '';
        preview(); toast('Sign-in page saved');
      } catch (ex) { toast(ex.message, 'err'); } finally { btn.disabled = false; }
    });
    preview();
  },
  async company(el) {
    const c = await api.get('/settings/company');
    el.innerHTML = `<form class="card page-form" novalidate><div class="card-body">${c.company_logo_url ? `<img src="${esc(c.company_logo_url)}" alt="logo" style="max-height:56px;margin-bottom:12px">` : ''}${formHtml([
      { name: 'company_name', label: 'Company name', required: true }, { name: 'logo', label: 'Logo', type: 'file' },
      { name: 'company_address', label: 'Address', span: 2 }, { name: 'company_phone', label: 'Phone' }, { name: 'company_email', label: 'Email', type: 'email' },
      { name: 'company_website', label: 'Website' }, { name: 'currency_symbol', label: 'Currency symbol' },
    ], c)}</div><div class="form-actions"><button class="btn primary" type="submit">Save company</button></div></form>`;
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api.form('PUT', '/settings/company', formData(e.target)); toast('Company settings saved — reloading'); setTimeout(() => location.reload(), 600); } catch (ex) { toast(ex.message, 'err'); }
    });
  },
  departments: (el) => lookupPane(el, 'departments', 'Department', [{ key: 'name', label: 'Department' }, { key: 'code', label: 'Code' }, { key: 'description', label: 'Description' }],
    [{ name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Code' }, { name: 'description', label: 'Description', span: 2 }]),
  locations: (el) => lookupPane(el, 'locations', 'Location', [{ key: 'name', label: 'Location' }, { key: 'building', label: 'Building' }, { key: 'floor', label: 'Floor' }, { key: 'room', label: 'Room' }, { key: 'address', label: 'Address' }],
    [{ name: 'name', label: 'Display name', required: true, span: 2, placeholder: 'Main Office - 2nd Floor' }, { name: 'building', label: 'Building' }, { name: 'floor', label: 'Floor' }, { name: 'room', label: 'Room / office' }, { name: 'address', label: 'Address' }, { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }]),
  async categories(el) { el.innerHTML = '<div class="card"><div class="card-body">Asset categories and their tag prefixes are managed on the <a href="#/categories">Categories page</a>.</div></div>'; },
  async numbering(el) {
    const c = await api.get('/settings/company');
    const preview = () => `LAP${c.tag_separator ?? '-'}${'1'.padStart(Number(c.tag_padding || 4), '0')}`;
    el.innerHTML = `<form class="card page-form" novalidate><div class="card-body">${formHtml([
      { type: 'section', label: 'Asset tag numbering', help: 'Tags are <PREFIX><separator><number>. The prefix comes from each category.' },
      { name: 'tag_padding', label: 'Number of digits', type: 'number', help: '4 → LAP-0001, 3 → LAP-001' },
      { name: 'tag_separator', label: 'Separator', help: 'Usually a dash' },
      { name: 'preview', label: 'Preview', type: 'static', html: `<b class="mono" data-preview>${esc(preview())}</b>` },
      { type: 'section', label: 'QR labels', help: 'Address phones open when they scan an asset sticker. Use this computer\'s network address, not localhost.' },
      { name: 'qr_base_url', label: 'QR link address', placeholder: 'http://192.168.1.50:4000', span: 2 },
      { type: 'section', label: 'Alerts' },
      { name: 'warranty_alert_days', label: 'Warranty “expiring soon” (days)', type: 'number' },
      { name: 'contract_alert_days', label: 'ISP contract “expiring soon” (days)', type: 'number' },
    ], c)}</div><div class="form-actions"><button class="btn primary" type="submit">Save</button></div></form>`;
    const f = el.querySelector('form');
    f.addEventListener('input', () => { c.tag_padding = f.tag_padding.value; c.tag_separator = f.tag_separator.value; f.querySelector('[data-preview]').textContent = preview(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api.put('/settings/company', readForm(f)); toast('Saved'); } catch (ex) { toast(ex.message, 'err'); }
    });
  },
  async users(el) {
    const [users, rp] = await Promise.all([api.get('/users'), api.get('/users/roles')]);
    el.innerHTML = `<section class="card"><div class="card-head"><h3>System users</h3><button class="btn sm primary" data-new>+ Add user</button></div><div data-t></div></section>`;
    mountTable(el.querySelector('[data-t]'), {
      rows: users,
      columns: [
        { key: 'full_name', label: 'Name', render: (u) => `<b>${esc(u.full_name)}</b><div class="cell-sub">${esc(u.email || '')}</div>` },
        { key: 'username', label: 'Username', render: (u) => `<span class="mono">${esc(u.username)}</span>` },
        { key: 'role', label: 'Role', render: (u) => badge(u.role) },
        { key: 'overrides', label: 'Custom permissions', render: (u) => (u.overrides ? badge(`${u.overrides} override(s)`, 'amber') : '<span class="muted">Role defaults</span>') },
        { key: 'status', label: 'Status', render: (u) => badge(u.status) },
        { key: 'last_login_at', label: 'Last sign-in', render: (u) => (u.last_login_at ? fmtDateTime(u.last_login_at) : '<span class="muted">Never</span>') },
        { key: 'x', label: '', nosort: true, render: (u) => `<div class="btn-group" style="flex-wrap:nowrap"><button class="btn xs" data-edit="${u.id}">Edit</button><button class="btn xs" data-perm="${u.id}">Permissions</button>${u.id === state.user.id ? '<span class="cell-sub" style="align-self:center">You</span>' : `${u.status === 'Active' ? `<button class="btn xs" data-dis="${u.id}">Disable</button>` : `<button class="btn xs" data-en="${u.id}">Enable</button>`}<button class="btn xs danger-text" data-del="${u.id}">Delete</button>`}</div>` },
      ],
    });
    const userModal = (u = null) => openModal({
      title: u ? `Edit ${u.full_name}` : 'Add user',
      body: formHtml([
        ...(u ? [] : [{ name: 'username', label: 'Username', required: true }]),
        { name: 'full_name', label: 'Full name', required: true }, { name: 'email', label: 'Email', type: 'email' },
        { name: 'role_id', label: 'Role', type: 'select', required: true, options: opt(rp.roles) },
        { name: 'status', label: 'Status', type: 'select', placeholder: false, options: opt(['Active', 'Disabled']) },
        { name: 'password', label: u ? 'Reset password (optional, min 8)' : 'Password (min 8 characters)', type: 'password', required: !u, span: 2 },
      ], u || { status: 'Active' }),
      onSubmit: async (f) => {
        const b = readForm(f);
        if (u) await api.put(`/users/${u.id}`, b); else await api.post('/users', b);
        await afterChange('User saved');
      },
    });
    on(el, 'click', '[data-new]', () => userModal());
    on(el, 'click', '[data-edit]', (_e, b) => userModal(users.find((u) => String(u.id) === b.dataset.edit)));
    on(el, 'click', '[data-dis]', async (_e, b) => {
      const u = users.find((x) => String(x.id) === b.dataset.dis);
      if (await confirmDialog('Disable user', `Disable <b>${esc(u.full_name)}</b>? They are signed out and can't sign in until you enable the account again.`, { confirmLabel: 'Disable', danger: false })) {
        await api.put(`/users/${u.id}`, { status: 'Disabled' }); await afterChange('User disabled');
      }
    });
    on(el, 'click', '[data-en]', async (_e, b) => {
      await api.put(`/users/${b.dataset.en}`, { status: 'Active' }); await afterChange('User enabled');
    });
    on(el, 'click', '[data-del]', async (_e, b) => {
      const u = users.find((x) => String(x.id) === b.dataset.del);
      if (await confirmDialog('Delete user', `<p style="margin-top:0">Delete <b>${esc(u.full_name)}</b> (<span class="mono">${esc(u.username)}</span>) permanently?</p>
        <ul style="margin:0;padding-left:18px;line-height:1.7"><li>The account is removed and can no longer sign in.</li><li>Its username <span class="mono">${esc(u.username)}</span> can be used for a new account.</li>
        <li>Past history and activity still show <b>${esc(u.full_name)}</b> as who made each change.</li></ul>
        <p class="muted" style="margin-bottom:0">This can't be undone. To block sign-in temporarily, use <b>Disable</b> instead.</p>`, { confirmLabel: 'Delete user' })) {
        await api.del(`/users/${u.id}`); await afterChange(`${u.full_name} deleted`);
      }
    });
    on(el, 'click', '[data-perm]', async (_e, b) => {
      const u = users.find((x) => String(x.id) === b.dataset.perm);
      const p = await api.get(`/users/${u.id}/permissions`);
      const ov = Object.fromEntries(p.overrides.map((o) => [o.permission_key, o.granted]));
      const mods = [...new Set(rp.permissions.map((x) => x.module))];
      openModal({
        title: `Permissions — ${u.full_name} (${p.role})`,
        size: 'xl',
        body: `<p class="muted" style="margin-top:0">Each permission follows the role by default. Override individually to grant or deny for this user only.</p>
          <div class="perm-grid">${mods.map((m) => `<div class="mod">${esc(m)}</div>${rp.permissions.filter((x) => x.module === m).map((x) => {
          const def = p.role_permissions.includes(x.key);
          const cur = x.key in ov ? (ov[x.key] ? 'grant' : 'deny') : 'role';
          return `<label style="display:block"><span><b class="mono" style="font-size:12px">${esc(x.key)}</b><br><span class="cell-sub">${esc(x.description)}</span></span>
            <select data-pk="${esc(x.key)}" style="margin-top:4px;width:100%;height:30px;border-radius:6px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text)">
              <option value="role" ${cur === 'role' ? 'selected' : ''}>Role default (${def ? 'allowed' : 'denied'})</option>
              <option value="grant" ${cur === 'grant' ? 'selected' : ''}>Grant</option><option value="deny" ${cur === 'deny' ? 'selected' : ''}>Deny</option></select></label>`;
        }).join('')}`).join('')}</div>`,
        onSubmit: async (f) => {
          const overrides = [...f.querySelectorAll('[data-pk]')].filter((s) => s.value !== 'role').map((s) => ({ permission_key: s.dataset.pk, granted: s.value === 'grant' ? 1 : 0 }));
          await api.put(`/users/${u.id}/permissions`, { overrides });
          await afterChange('Permissions saved');
        },
      });
    });
  },
  async roles(el) {
    const rp = await api.get('/users/roles');
    const mods = [...new Set(rp.permissions.map((x) => x.module))];
    el.innerHTML = `<div class="stack">${rp.roles.map((r) => `<form class="card" data-role="${r.id}"><div class="card-head"><div><h3>${esc(r.name.toUpperCase())}</h3><div class="cell-sub">${esc(r.description || '')}</div></div>
      ${r.name === 'Admin' ? badge('Full access (locked)', 'blue') : '<button class="btn sm primary" type="submit">Save role</button>'}</div>
      <div class="card-body"><div class="perm-grid">${mods.map((m) => `<div class="mod">${esc(m)}</div>${rp.permissions.filter((x) => x.module === m).map((x) => `<label><input type="checkbox" value="${esc(x.key)}" ${r.permissions.includes(x.key) ? 'checked' : ''} ${r.name === 'Admin' ? 'disabled' : ''}>
        <span><b class="mono" style="font-size:12px">${esc(x.key)}</b><br><span class="cell-sub">${esc(x.description)}</span></span></label>`).join('')}`).join('')}</div></div></form>`).join('')}</div>`;
    on(el, 'submit', 'form[data-role]', async (e, f) => {
      e.preventDefault();
      const perms = [...f.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value);
      try { await api.put(`/users/roles/${f.dataset.role}`, { permissions: perms }); await afterChange('Role permissions saved'); } catch (ex) { toast(ex.message, 'err'); }
    });
  },
  async system(el) {
    el.innerHTML = `<div class="grid g2">${card('Your account', kv([['Name', esc(state.user.full_name)], ['Username', esc(state.user.username)], ['Role', badge(state.user.role)], ['Permissions', `${state.user.permissions.length}`]]))}
      ${card('Local development', `<p style="margin-top:0">This build runs fully offline on a local SQLite database.</p>${kv([
      ['Reset sample data', '<code>npm run db:reset</code>'], ['Database file', '<code>data/itms.db</code>'], ['Vault key', '<code>data/vault.key</code> (or ITMS_VAULT_KEY env)'], ['Uploads', '<code>data/uploads/</code>'],
      ['Monitoring', 'ISP / device statuses are manual. Fields <code>status_source</code> and <code>monitor_*</code> are reserved for future ping/SNMP.'],
    ])}`)}</div>`;
  },
};

async function lookupPane(el, path, label, columns, fields) {
  const rows = await api.get(`/settings/${path}`);
  el.innerHTML = `<section class="card"><div class="card-head"><h3>${label}s</h3><button class="btn sm primary" data-new>+ Add ${label.toLowerCase()}</button></div><div data-t></div></section>`;
  mountTable(el.querySelector('[data-t]'), {
    rows,
    columns: [...columns, { key: 'usage', label: 'Used by' }, { key: 'x', label: '', nosort: true, render: (r) => `<button class="btn xs" data-edit="${r.id}">Edit</button> ${r.usage ? '' : `<button class="btn xs ghost" data-del="${r.id}">Delete</button>`}` }],
  });
  const modal = (r = null) => openModal({
    title: r ? `Edit ${r.name}` : `Add ${label.toLowerCase()}`,
    body: formHtml(fields, r || {}),
    onSubmit: async (f) => {
      const b = readForm(f);
      if (r) await api.put(`/settings/${path}/${r.id}`, b); else await api.post(`/settings/${path}`, b);
      await afterChange(`${label} saved`);
    },
  });
  on(el, 'click', '[data-new]', () => modal());
  on(el, 'click', '[data-edit]', (_e, b) => modal(rows.find((r) => String(r.id) === b.dataset.edit)));
  on(el, 'click', '[data-del]', async (_e, b) => {
    if (await confirmDialog(`Delete ${label.toLowerCase()}`, 'Delete this entry?', { confirmLabel: 'Delete' })) { await api.del(`/settings/${path}/${b.dataset.del}`); await afterChange(`${label} deleted`); }
  });
}
