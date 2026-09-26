// Phone directory: company contacts plus (optionally) employees' numbers. Exportable to Excel / CSV.
import { api, esc, badge, can, mountTable, setTitle, on, openModal, formHtml, readForm, opt, confirmDialog, toast, debounce, qs } from '../core.js';
import { icon } from '../icons.js';
import { afterChange } from './actions.js';

const TONE = { Internal: 'blue', 'Vendor / Supplier': 'violet', 'ISP / Telco': 'teal', Emergency: 'red', Client: 'green', Government: 'slate', Other: 'gray', Employees: 'amber' };
const telHref = (n) => `tel:${String(n).replace(/[^0-9+]/g, '')}`;
const num = (n) => (n ? `<span class="phone-num"><a href="${telHref(n)}" class="mono">${esc(n)}</a><button type="button" class="icon-btn copy-num" data-copy-num="${esc(n)}" title="Copy number" aria-label="Copy ${esc(n)}">⧉</button></span>` : '');

export async function page(el, _m, params) {
  setTitle('Phone Directory');
  const manage = can('directory.manage');
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('itms-directory') || '{}'); } catch { /* ignore */ }
  const first = await api.get('/directory');
  const categories = first.categories;
  el.innerHTML = `<div class="page-head"><div><h1>Phone Directory</h1><p>Company contacts, suppliers, ISPs and emergency numbers in one place. Click a number to call it or ⧉ to copy it.</p></div>
    <div class="page-actions">
      <a class="btn" data-exp="xlsx" href="/api/directory/export">${icon('download').replace('<svg', '<svg width="15" height="15"')} Export Excel</a>
      <a class="btn" data-exp="csv" href="/api/directory/export?format=csv">Export CSV</a>
      ${manage ? '<button class="btn primary" type="button" data-add>+ Add contact</button>' : ''}</div></div>
    <section class="card">
      <div class="filters">
        <div class="search-input"><input type="search" name="q" placeholder="Search name, company, department, number, email…" value="${esc(params.q || '')}"></div>
        <select name="category"><option value="">All categories</option>${[...categories, 'Employees'].map((c) => `<option ${params.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <label class="check" style="font-size:13px"><input type="checkbox" name="include_employees" ${prefs.include_employees ? 'checked' : ''}> Include employees</label>
      </div>
      <div data-t></div></section>`;

  let rows = [];
  const table = mountTable(el.querySelector('[data-t]'), {
    rows, pageSize: 100, empty: 'No contacts found',
    columns: [
      { key: 'name', label: 'Name', cls: 'dir-name', render: (c) => `<div style="display:flex;gap:8px;align-items:flex-start">${c.source === 'contact' && manage ? `<button type="button" class="icon-btn star ${c.is_favorite ? 'on' : ''}" data-fav="${c.id}" title="${c.is_favorite ? 'Remove from favourites' : 'Pin to top'}" aria-label="Favourite">${c.is_favorite ? '★' : '☆'}</button>` : c.is_favorite ? '<span class="star on" aria-hidden="true">★</span>' : ''}
        <div><b>${esc(c.name)}</b>${c.position ? `<div class="cell-sub">${esc(c.position)}</div>` : ''}</div></div>` },
      { key: 'organization', label: 'Company / Department', cls: 'dir-org', render: (c) => `${esc(c.organization || '')}${c.department ? `<div class="cell-sub">${esc(c.department)}</div>` : ''}` },
      { key: 'phone', label: 'Phone', nosort: true, render: (c) => num(c.phone) || '<span class="muted">—</span>' },
      { key: 'mobile', label: 'Mobile', nosort: true, render: (c) => num(c.mobile) || '<span class="muted">—</span>' },
      { key: 'local_ext', label: 'Local / Ext.', render: (c) => (c.local_ext ? `<span class="mono">${esc(c.local_ext)}</span>` : '<span class="muted">—</span>') },
      { key: 'email', label: 'Email', render: (c) => (c.email ? `<span class="mono" style="font-size:12.5px">${esc(c.email)}</span>` : '<span class="muted">—</span>') },
      { key: 'category', label: 'Category', render: (c) => badge(c.category, TONE[c.category] || 'gray') },
      { key: 'notes', label: 'Notes', render: (c) => `<span class="cell-sub">${esc(c.notes || '')}</span>` },
      { key: 'x', label: '', nosort: true, render: (c) => (c.source === 'employee' ? `<a class="btn xs" href="#/employees/${c.id}">Profile</a>` : manage ? `<div class="btn-group" style="flex-wrap:nowrap"><button class="btn xs" data-edit="${c.id}">Edit</button><button class="btn xs danger-text" data-del="${c.id}">Delete</button></div>` : '') },
    ],
  });

  const filters = () => {
    const f = {};
    el.querySelectorAll('.filters [name]').forEach((x) => { if (x.type === 'checkbox') { if (x.checked) f[x.name] = '1'; } else if (x.value) f[x.name] = x.value; });
    return f;
  };
  const load = async () => {
    const f = filters();
    try { localStorage.setItem('itms-directory', JSON.stringify({ include_employees: !!f.include_employees })); } catch { /* ignore */ }
    rows = (await api.get(`/directory${qs(f)}`)).contacts;
    table.update(rows);
    el.querySelector('[data-exp=xlsx]').setAttribute('href', `/api/directory/export${qs(f)}`);
    el.querySelector('[data-exp=csv]').setAttribute('href', `/api/directory/export${qs({ ...f, format: 'csv' })}`);
  };
  el.querySelector('.filters').addEventListener('input', debounce(load, 200));

  const edit = (c = null) => openModal({
    title: c ? `Edit ${c.name}` : 'Add contact',
    size: 'lg',
    body: formHtml([
      { name: 'name', label: 'Name', required: true, span: 2, placeholder: 'Person, office or hotline name', attrs: 'maxlength="120"' },
      { name: 'organization', label: 'Company / office', placeholder: 'e.g. Converge, Dell PH, Building Admin' },
      { name: 'department', label: 'Department' },
      { name: 'position', label: 'Position' },
      { name: 'category', label: 'Category', type: 'select', placeholder: false, options: opt(categories) },
      { name: 'phone', label: 'Phone', type: 'tel', placeholder: '(02) 8123 4567' },
      { name: 'mobile', label: 'Mobile', type: 'tel', placeholder: '0917 123 4567' },
      { name: 'local_ext', label: 'Local / extension', placeholder: '104' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, span: 2, placeholder: 'Account number, service hours, what they handle…' },
      { name: 'is_favorite', label: 'Pin to top (favourite)', type: 'checkbox', span: 2 },
    ], c || { category: 'Other' }),
    onSubmit: async (form) => {
      const b = readForm(form);
      if (!b.phone && !b.mobile && !b.local_ext) throw new Error('Enter at least one number (phone, mobile or local)');
      if (c) await api.put(`/directory/${c.id}`, b); else await api.post('/directory', b);
      await afterChange(c ? 'Contact updated' : 'Contact added');
    },
  });
  const byId = (id) => rows.find((r) => r.source === 'contact' && String(r.id) === String(id));
  on(el, 'click', '[data-add]', () => edit());
  on(el, 'click', '[data-edit]', (_e, b) => edit(byId(b.dataset.edit)));
  on(el, 'click', '[data-fav]', async (_e, b) => {
    const c = byId(b.dataset.fav);
    await api.put(`/directory/${c.id}`, { is_favorite: c.is_favorite ? 0 : 1 });
    await load();
  });
  on(el, 'click', '[data-del]', async (_e, b) => {
    const c = byId(b.dataset.del);
    if (await confirmDialog('Delete contact', `Delete <b>${esc(c.name)}</b> from the phone directory?`, { confirmLabel: 'Delete' })) {
      await api.del(`/directory/${c.id}`); toast('Contact deleted'); await load();
    }
  });
  on(el, 'click', '[data-copy-num]', async (e, b) => {
    e.preventDefault();
    try { await navigator.clipboard.writeText(b.dataset.copyNum); toast(`Copied ${b.dataset.copyNum}`); } catch { toast('Copy not available — select the number instead', 'err'); }
  });
  await load();
}
