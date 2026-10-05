// Asset list import (Excel/CSV → check → import) and export (same columns, so a file can
// be exported, edited in Excel and imported back). Registered on the assets router.
const multer = require('multer');
const db = require('../db/connection');
const { requirePerm, can } = require('../lib/auth');
const { log } = require('../lib/activity');
const { bad, insert, setting } = require('../lib/util');
const { getAsset } = require('../lib/queries');
const { listAssets } = require('../lib/assetQueries');
const { STATUSES, prepareUpdate, warrantyChanges, createAsset, updateAsset, deployAsset } = require('../lib/assetService');
const { readTable, toCsv, writeXlsx } = require('../lib/spreadsheet');
const { normalizeMac, MAC_RE } = require('../lib/ip');

const MAX_ROWS = 2000;
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Columns in file order. `aliases` are other header spellings people commonly use.
const COLUMNS = [
  { key: 'asset_tag', header: 'Asset Tag', aliases: ['tag', 'assetno', 'assetnumber', 'assetid', 'propertyno', 'propertynumber', 'tagno'] },
  { key: 'name', header: 'Asset Name', required: true, aliases: ['name', 'item', 'itemname', 'devicename', 'assetdescription'] },
  { key: 'category', header: 'Category', required: true, aliases: ['type', 'assettype', 'devicetype', 'itemtype'] },
  { key: 'brand', header: 'Brand', aliases: ['make', 'manufacturer'] },
  { key: 'model', header: 'Model', aliases: ['modelno', 'modelnumber'] },
  { key: 'serial_number', header: 'Serial Number', aliases: ['serial', 'serialno', 'sn'] },
  { key: 'service_tag', header: 'Service Tag', aliases: [] },
  { key: 'description', header: 'Description', aliases: ['specs', 'specifications'] },
  { key: 'status', header: 'Status', aliases: [] },
  { key: 'assign_to', header: 'Assigned To (Employee ID or Name)', aliases: ['assignedto', 'assignee', 'employee', 'employeeid', 'custodian', 'user', 'issuedto'] },
  { key: 'department', header: 'Department', aliases: ['dept'] },
  { key: 'location', header: 'Location', aliases: ['site', 'office', 'building', 'branch'] },
  { key: 'current_location', header: 'Location Detail', aliases: ['currentlocation', 'desk', 'room', 'area'] },
  { key: 'supplier', header: 'Supplier', aliases: ['vendor'] },
  { key: 'purchase_date', header: 'Purchase Date', type: 'date', aliases: ['dateacquired', 'datepurchased', 'acquired', 'acquisitiondate'] },
  { key: 'purchase_cost', header: 'Purchase Cost', type: 'money', aliases: ['cost', 'price', 'amount', 'unitcost', 'acquisitioncost'] },
  { key: 'po_number', header: 'PO Number', aliases: ['po', 'pono', 'purchaseorder'] },
  { key: 'invoice_number', header: 'Invoice Number', aliases: ['invoice', 'invoiceno', 'ornumber', 'orno'] },
  { key: 'warranty_start', header: 'Warranty Start', type: 'date', aliases: ['warrantystartdate'] },
  { key: 'warranty_end', header: 'Warranty End', type: 'date', aliases: ['warrantyexpiration', 'warrantyexpiry', 'warrantyuntil', 'warrantyenddate', 'warranty'] },
  { key: 'mac_address', header: 'MAC Address', aliases: ['mac'] },
  { key: 'notes', header: 'Notes', aliases: ['remarks', 'comments'] },
];
// Export-only columns: shown for reference, ignored on import.
const INFO_COLUMNS = ['Employee Name (info)', 'IP Address (info)', 'Warranty Status (info)'];
const STRING_KEYS = ['name', 'brand', 'model', 'serial_number', 'service_tag', 'description', 'supplier', 'po_number', 'invoice_number', 'current_location', 'notes'];

const norm = (s) => String(s ?? '').replace(/\(.*?\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_MAP = new Map();
for (const c of COLUMNS) for (const h of [c.header, c.key, ...c.aliases]) HEADER_MAP.set(norm(h), c);

// ───────── value parsing ─────────
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseDate(v) {
  if (v === '' || v === null || v === undefined) return { value: null };
  const r = parseDateLoose(v);
  if (r.value || r.error) return r;
  return { value: null, error: `“${text(v)}” is not a real date (use YYYY-MM-DD, e.g. 2026-01-05)` };
}

function parseDateLoose(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return { value: isoOf(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()) };
  if (typeof v === 'number' && v > 20000 && v < 80000) { // Excel serial date
    const d = new Date(Math.round((v - 25569) * 864e5));
    return { value: isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return { value: isoOf(+m[1], +m[2], +m[3]) };
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // MM/DD/YYYY (Philippine / US order)
  if (m) return +m[1] > 12 ? { value: isoOf(+m[3], +m[2], +m[1]) } : { value: isoOf(+m[3], +m[1], +m[2]) };
  m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/); // Jan 5, 2026
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return { value: isoOf(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]) };
  m = s.match(/^(\d{1,2}) ([A-Za-z]{3,9})\.?,? (\d{4})$/); // 5 Jan 2026
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return { value: isoOf(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]) };
  return { value: null, error: `“${s}” is not a date (use YYYY-MM-DD, e.g. 2026-01-05)` };
}

function parseMoney(v) {
  if (v === '' || v === null || v === undefined) return { value: null };
  if (typeof v === 'number') return { value: v };
  const s = String(v).replace(/[₱$,\s]|PHP|php/g, '');
  const n = Number(s);
  return Number.isFinite(n) && s !== '' ? { value: n } : { value: null, error: `“${v}” is not an amount` };
}

const text = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return parseDate(v).value || '';
  let s = String(v).trim();
  if (/^'[=+\-@]/.test(s)) s = s.slice(1); // undo the formula guard added on export
  return s;
};

// ───────── lookups ─────────
function lookups() {
  const byName = (rows) => new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));
  const cats = db.all('SELECT id, name, prefix FROM asset_categories');
  const catMap = byName(cats);
  for (const c of cats) catMap.set(c.prefix.toLowerCase(), c);
  const emps = db.all('SELECT id, employee_code, full_name, status, department_id, location_id FROM employees');
  const empByCode = new Map(emps.map((e) => [e.employee_code.toLowerCase(), e]));
  const empByName = new Map();
  for (const e of emps) { const k = e.full_name.trim().toLowerCase(); empByName.set(k, empByName.has(k) ? 'ambiguous' : e); }
  const prefixes = new Set(cats.map((c) => c.prefix.toUpperCase()));
  return {
    cats: catMap, catNames: cats.map((c) => c.name),
    // Tag prefix for a category that doesn't exist yet: "Computer" → COM (then COMP, COM2… if taken).
    newPrefix(name) {
      const letters = String(name).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'CAT';
      const tries = [letters.slice(0, 3), letters.slice(0, 4), letters.slice(0, 5)];
      for (let i = 2; i < 100; i++) tries.push(`${letters.slice(0, 3)}${i}`);
      const p = tries.find((t) => t.length >= 2 && !prefixes.has(t)) || `C${Date.now() % 100000}`;
      prefixes.add(p);
      return p;
    },
    departments: byName(db.all('SELECT id, name FROM departments')),
    locations: byName(db.all('SELECT id, name FROM locations')),
    employee(v) {
      const s = String(v).trim().toLowerCase();
      const code = s.match(/^([a-z]+-?\d+)\b/); // "EMP-001" or "EMP-001 - Juan Dela Cruz"
      if (code && empByCode.has(code[1])) return empByCode.get(code[1]);
      return empByName.get(s.replace(/^[a-z]+-?\d+\s*[-–—:]\s*/, '')) || null;
    },
  };
}

// Next auto tags per category while planning (the import itself asks the database again).
function tagAllocator() {
  const next = new Map();
  const padLen = Number(setting('tag_padding', 4));
  const sep = setting('tag_separator', '-');
  return (cat) => {
    if (!next.has(cat.id)) {
      let max = 0;
      for (const { asset_tag: t } of db.all('SELECT asset_tag FROM assets WHERE asset_tag LIKE ?', `${cat.prefix}${sep}%`)) {
        const n = Number(t.slice(cat.prefix.length + sep.length));
        if (Number.isInteger(n) && n > max) max = n;
      }
      next.set(cat.id, max + 1);
    }
    const n = next.get(cat.id);
    next.set(cat.id, n + 1);
    return `${cat.prefix}${sep}${String(n).padStart(padLen, '0')}`;
  };
}

// ───────── planning (the "check" step) ─────────
function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const hits = rows[i].filter((h) => HEADER_MAP.has(norm(h))).length;
    if (hits >= 2) return i;
  }
  return -1;
}

function plan(req, table, opts) {
  const hi = findHeader(table);
  if (hi < 0) throw bad('Could not find the header row. The first row must contain column names such as “Asset Name” and “Category”. Download the template to see the layout.');
  const headers = table[hi];
  const colIndex = new Map();
  const ignored = [];
  headers.forEach((h, i) => {
    const c = HEADER_MAP.get(norm(h));
    if (c && !colIndex.has(c.key)) colIndex.set(c.key, i);
    else if (String(h).trim()) ignored.push(String(h).trim());
  });
  const missing = COLUMNS.filter((c) => c.required && !colIndex.has(c.key)).map((c) => c.header);
  const hasTag = colIndex.has('asset_tag');
  if (missing.length && !hasTag) throw bad(`Missing required column(s): ${missing.join(', ')}`);

  const body = table.slice(hi + 1).map((cells, i) => ({ rowNum: hi + 2 + i, cells }))
    .filter((r) => r.cells.some((c) => text(c) !== ''));
  if (!body.length) throw bad('The file has no asset rows under the header');
  if (body.length > MAX_ROWS) throw bad(`Import at most ${MAX_ROWS} rows at a time (this file has ${body.length})`);

  const L = lookups();
  const allocate = tagAllocator();
  const seenTags = new Map();
  const seenSerials = new Map();
  const newLookups = { departments: new Map(), locations: new Map(), categories: new Map() };
  const plannedCats = new Map(); // lower(name) → { id, name, prefix } for categories the import will create
  const canCreate = can(req.user, 'assets.create');
  const canEdit = can(req.user, 'assets.edit');
  const canAssign = can(req.user, 'assets.assign');

  const results = body.map(({ rowNum, cells }) => {
    const raw = {};
    for (const [key, i] of colIndex) raw[key] = cells[i];
    const errors = []; const warnings = [];
    const val = (k) => text(raw[k]);
    const tag = val('asset_tag').toUpperCase();
    const existing = tag ? db.get('SELECT * FROM assets WHERE asset_tag = ?', tag) : null;
    if (tag) {
      if (seenTags.has(tag)) errors.push(`Asset tag ${tag} also appears in row ${seenTags.get(tag)}`);
      else seenTags.set(tag, rowNum);
    }
    let action = existing ? (opts.mode === 'create_only' ? 'skip' : 'update') : 'create';
    if (action === 'create' && !canCreate) errors.push('You do not have permission to add assets');
    if (action === 'update' && !canEdit) errors.push('You do not have permission to edit assets');

    const data = {};
    const w = {};
    for (const k of STRING_KEYS) if (val(k)) data[k] = val(k);
    // Category
    if (val('category')) {
      const name = val('category'); const key = name.toLowerCase();
      const c = L.cats.get(key);
      if (c) data.category_id = c.id;
      else if (opts.createLookups) {
        if (!plannedCats.has(key)) plannedCats.set(key, { id: `new:${key}`, name, prefix: L.newPrefix(name) });
        data._new_category = plannedCats.get(key).name;
        warnings.push(`New category “${name}” will be created (tags ${plannedCats.get(key).prefix}-0001 …)`);
      } else errors.push(`Unknown category “${name}”. Tick “Create … that don't exist yet”, or add it under Assets → Categories (existing: ${L.catNames.join(', ')})`);
    }
    // Department / location (optionally created)
    for (const [key, map, label] of [['department', L.departments, 'department'], ['location', L.locations, 'location']]) {
      const v = val(key);
      if (!v) continue;
      const hit = map.get(v.toLowerCase());
      if (hit) data[`${key}_id`] = hit.id;
      else if (opts.createLookups) {
        data[`_new_${key}`] = v;
        warnings.push(`New ${label} “${v}” will be created`);
      } else errors.push(`Unknown ${label} “${v}”`);
    }
    // Status
    let status = val('status');
    if (status) {
      const canon = STATUSES.find((s) => s.toLowerCase() === status.toLowerCase()) || (/^(assigned|issued|in use)$/i.test(status) ? 'Deployed' : null);
      if (!canon) errors.push(`Unknown status “${status}” (use ${STATUSES.join(', ')})`);
      status = canon;
    }
    // Dates, money, MAC
    for (const k of ['purchase_date', 'warranty_start', 'warranty_end']) {
      if (!colIndex.has(k)) continue;
      const r = parseDate(raw[k]);
      if (r.error) errors.push(`${COLUMNS.find((c) => c.key === k).header}: ${r.error}`);
      else if (r.value) (k === 'purchase_date' ? data : w)[k] = r.value;
    }
    if (colIndex.has('purchase_cost')) {
      const r = parseMoney(raw.purchase_cost);
      if (r.error) errors.push(`Purchase Cost: ${r.error}`); else if (r.value !== null) data.purchase_cost = r.value;
    }
    if (data.mac_address === undefined && val('mac_address')) {
      if (MAC_RE.test(val('mac_address'))) data.mac_address = normalizeMac(val('mac_address'));
      else errors.push(`MAC address “${val('mac_address')}” must look like AA:BB:CC:DD:EE:FF`);
    }
    if (w.warranty_start && w.warranty_end && w.warranty_start > w.warranty_end) errors.push('Warranty Start is after Warranty End');
    // Serial duplicates → warnings only
    if (data.serial_number) {
      const s = data.serial_number.toLowerCase();
      if (seenSerials.has(s)) warnings.push(`Serial number also used in row ${seenSerials.get(s)}`);
      else seenSerials.set(s, rowNum);
      const other = db.get('SELECT asset_tag FROM assets WHERE lower(serial_number) = ? AND asset_tag != ?', s, tag || '');
      if (other) warnings.push(`Serial number is already on ${other.asset_tag}`);
    }
    // Assignment
    let employee = null;
    const assignTo = val('assign_to');
    if (assignTo) {
      employee = L.employee(assignTo);
      if (employee === 'ambiguous') { errors.push(`More than one employee is named “${assignTo}” — use the Employee ID`); employee = null; }
      else if (!employee) errors.push(`Employee “${assignTo}” not found (use the Employee ID, e.g. EMP-001)`);
      else if (employee.status !== 'Active') { errors.push(`${employee.full_name} is ${employee.status}`); employee = null; }
      else if (!canAssign) { errors.push('You do not have permission to assign assets'); employee = null; }
    }

    const out = { row: rowNum, action, asset_tag: tag || null, name: data.name || existing?.name || null, category: val('category') || null, changes: [], assign_to: null, errors, warnings };

    if (action === 'create') {
      if (!data.name) errors.push('Asset Name is required');
      if (!val('category')) errors.push('Category is required for new assets');
      if (status === 'Deployed' && !employee && !errors.some((e) => e.startsWith('Employee'))) errors.push('Status “Deployed” needs an employee in “Assigned To”');
      if (employee && status && !['Available', 'Deployed'].includes(status)) errors.push(`An asset that is ${status} can't be assigned — leave Status empty or set Available`);
      if (status && status !== 'Deployed') data.status = status;
      if (tag) data.asset_tag = tag;
      const cat = (data.category_id && L.cats.get(val('category').toLowerCase())) || (data._new_category && plannedCats.get(data._new_category.toLowerCase()));
      out.asset_tag = tag || (cat && !errors.length ? allocate(cat) : null);
      out.auto_tag = !tag;
      if (employee) out.assign_to = `${employee.full_name} (${employee.employee_code})`;
    } else if (action === 'update') {
      if (status && status !== 'Deployed') data.status = status;
      const current = getAsset(existing.id);
      if (employee) {
        if (current.employee_id === employee.id) employee = null; // already assigned — nothing to do
        else if (current.employee_id) { warnings.push(`Currently assigned to ${current.employee_name}; assignment not changed (use Transfer)`); employee = null; }
        else if ((data.status || existing.status) !== 'Available') { errors.push(`${tag} is ${data.status || existing.status} and can't be assigned`); employee = null; }
      } else if (status === 'Deployed' && !current.employee_id) errors.push('Status “Deployed” needs an employee in “Assigned To”');
      const patch = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_')));
      try {
        out.changes = prepareUpdate(existing, { ...patch });
        if (warrantyChanges(existing.id, w)) out.changes.push('warranty');
      } catch (e) { errors.push(e.message); }
      out.changes = out.changes.map((k) => (COLUMNS.find((c) => c.key === k || `${c.key}_id` === k) || { header: k.replace(/_id$/, '') }).header);
      if (data._new_department) out.changes.push('Department');
      if (data._new_location) out.changes.push('Location');
      if (employee) out.assign_to = `${employee.full_name} (${employee.employee_code})`;
      if (!out.changes.length && !employee && !errors.length) out.action = 'unchanged';
    } else {
      warnings.push(`${tag} already exists — skipped (“Add new assets only” is selected)`);
    }
    Object.defineProperty(out, '_work', { value: { data, w, existing, employee }, enumerable: false });
    return out;
  });

  // Only create departments/locations that rows being imported actually need.
  for (const r of results) {
    if (r.errors.length) r.warnings = r.warnings.filter((m) => !/^New (department|location|category)/.test(m));
    if (r.errors.length || !['create', 'update'].includes(r.action)) continue;
    const { data } = r._work;
    if (data._new_department) newLookups.departments.set(data._new_department.toLowerCase(), data._new_department);
    if (data._new_location) newLookups.locations.set(data._new_location.toLowerCase(), data._new_location);
    if (data._new_category) { const c = plannedCats.get(data._new_category.toLowerCase()); newLookups.categories.set(c.name.toLowerCase(), { name: c.name, prefix: c.prefix }); }
  }
  const summary = { total: results.length, create: 0, update: 0, unchanged: 0, skip: 0, errors: 0, warnings: 0 };
  for (const r of results) {
    if (r.errors.length) summary.errors++; else summary[r.action]++;
    if (r.warnings.length) summary.warnings++;
  }
  return {
    columns: { recognized: [...colIndex.keys()].map((k) => COLUMNS.find((c) => c.key === k).header), ignored, missing: hasTag ? missing : [] },
    new_lookups: { departments: [...newLookups.departments.values()], locations: [...newLookups.locations.values()], categories: [...newLookups.categories.values()] },
    summary, rows: results,
  };
}

// ───────── commit (the "import" step) ─────────
function commit(req, planned, fileName) {
  const done = { created: 0, updated: 0, assigned: 0, failed: 0 };
  db.tx(() => {
    const ids = { department: new Map(), location: new Map(), category: new Map() };
    for (const c of planned.new_lookups.categories || []) {
      const hit = db.get('SELECT id FROM asset_categories WHERE lower(name) = lower(?)', c.name);
      let id = hit && hit.id;
      if (!hit) {
        let prefix = c.prefix;
        for (let i = 2; db.get('SELECT 1 AS x FROM asset_categories WHERE prefix = ?', prefix); i++) prefix = `${c.prefix.slice(0, 3)}${i}`;
        id = insert('asset_categories', { name: c.name, prefix, type_group: 'Other', is_network: 0 });
        log(req, 'Category created', 'category', id, c.name, { prefix, source: 'import' });
      }
      ids.category.set(c.name.toLowerCase(), id);
    }
    for (const kind of ['department', 'location']) {
      for (const name of planned.new_lookups[`${kind}s`]) {
        const hit = db.get(`SELECT id FROM ${kind}s WHERE lower(name) = lower(?)`, name);
        const id = hit ? hit.id : insert(`${kind}s`, { name });
        if (!hit) log(req, `${kind === 'department' ? 'Department' : 'Location'} created`, `${kind}s`, id, name, { source: 'import' });
        ids[kind].set(name.toLowerCase(), id);
      }
    }
    for (const r of planned.rows) {
      if (r.errors.length || !['create', 'update'].includes(r.action)) continue;
      const { data, w, existing, employee } = r._work;
      for (const kind of ['department', 'location', 'category']) {
        if (data[`_new_${kind}`]) { data[`${kind}_id`] = ids[kind].get(data[`_new_${kind}`].toLowerCase()); delete data[`_new_${kind}`]; }
      }
      try {
        db.tx(() => {
          let id;
          if (r.action === 'create') {
            id = createAsset(req, data, w, { source: `imported from ${fileName}` });
            done.created++;
          } else {
            id = existing.id;
            updateAsset(req, existing, data, w, { source: 'spreadsheet import' });
            done.updated++;
          }
          r.asset_id = id;
          r.asset_tag = getAsset(id).asset_tag;
          if (employee) {
            deployAsset(req, getAsset(id), employee, { department_id: data.department_id, location_id: data.location_id, notes: 'Assigned via spreadsheet import' });
            done.assigned++;
          }
        });
      } catch (e) {
        r.errors.push(e.message);
        done.failed++;
      }
    }
    log(req, 'Assets imported from file', 'asset', null, fileName, done);
  });
  return done;
}

// ───────── export ─────────
function exportRows(assets) {
  return assets.map((a) => [
    a.asset_tag, a.name, a.category, a.brand, a.model, a.serial_number, a.service_tag, a.description, a.status,
    a.employee_code || '', a.department, a.location, a.current_location, a.supplier,
    a.purchase_date, a.purchase_cost, a.po_number, a.invoice_number, a.warranty_start, a.warranty_end, a.mac_address, a.notes,
    a.employee_name || '', a.ip_address || '', a.warranty_status,
  ].map((v) => (v === null || v === undefined ? '' : v)));
}

async function listsSheet() {
  const cats = db.all('SELECT name FROM asset_categories ORDER BY name').map((r) => r.name);
  const deps = db.all('SELECT name FROM departments ORDER BY name').map((r) => r.name);
  const locs = db.all('SELECT name FROM locations ORDER BY name').map((r) => r.name);
  const emps = db.all("SELECT employee_code FROM employees WHERE status = 'Active' ORDER BY employee_code").map((r) => r.employee_code);
  const cols = [cats, [...STATUSES], deps, locs, emps];
  const n = Math.max(...cols.map((c) => c.length));
  const rows = Array.from({ length: n }, (_, i) => cols.map((c) => c[i] ?? ''));
  // Short lists go into the drop-down itself ("Laptop,Desktop,…"): that works in every spreadsheet app,
  // including Excel on phones and WPS, which don't show lists that point at another sheet. Long lists
  // (over Excel's 255-character limit) point at the Lists sheet instead. Empty lists get no drop-down.
  const list = (col, values) => {
    if (!values.length) return null;
    const inline = values.join(',');
    if (inline.length <= 250 && !values.some((v) => /[,"]/.test(v))) return `"${inline}"`;
    return `Lists!$${col}$2:$${col}$${values.length + 1}`;
  };
  const lists = {
    Category: list('A', cats), Status: list('B', [...STATUSES]), Department: list('C', deps),
    Location: list('D', locs), 'Assigned To (Employee ID or Name)': list('E', emps),
  };
  for (const k of Object.keys(lists)) if (!lists[k]) delete lists[k];
  return {
    sheet: { name: 'Lists', headers: ['Category', 'Status', 'Department', 'Location', 'Employee ID'], rows, widths: [22, 16, 22, 30, 16] },
    lists,
  };
}

const HEADERS = COLUMNS.map((c) => c.header);
const assetSheet = (rows, lists, extra = []) => ({
  name: 'Assets', headers: [...HEADERS, ...extra], rows, lists, validateRows: 1000,
  required: new Set(COLUMNS.filter((c) => c.required).map((c) => c.header)), readOnly: new Set(INFO_COLUMNS),
  dateCols: COLUMNS.map((c, i) => (c.type === 'date' ? i : -1)).filter((i) => i >= 0),
  moneyCols: COLUMNS.map((c, i) => (c.type === 'money' ? i : -1)).filter((i) => i >= 0),
  widths: HEADERS.map((h) => ({ 'Asset Name': 30, Description: 30, Notes: 30, 'Assigned To (Employee ID or Name)': 22, Location: 26 }[h] || Math.max(h.length + 3, 13))),
});

const stamp = () => new Date().toISOString().slice(0, 10);
const INSTRUCTIONS = [
  'How to import assets',
  '',
  '1. Fill in the “Assets” sheet — one row per asset. Blue headers (Asset Name, Category) are required for new assets.',
  '2. Leave “Asset Tag” empty to get the next number automatically (e.g. LAP-0007). To update an existing asset, put its tag.',
  '3. Category, Status, Department, Location and Assigned To have drop-down lists (see the “Lists” sheet).',
  '4. Dates: YYYY-MM-DD (2026-01-05) or MM/DD/YYYY. Cost: numbers only, e.g. 68500.',
  '5. “Assigned To”: Employee ID (EMP-001) or exact full name. The asset is deployed to that employee.',
  '6. When updating, empty cells leave the current value unchanged.',
  '7. In the system: Assets → Import → upload this file → review the check → Import.',
  '',
  'Example row',
  ['Asset Tag', 'Asset Name', 'Category', 'Brand', 'Model', 'Serial Number', 'Status', 'Assigned To', 'Department', 'Location', 'Purchase Date', 'Purchase Cost', 'Warranty End'],
  ['(leave empty)', 'Dell Latitude 5440', 'Laptop', 'Dell', 'Latitude 5440', 'ABC123456', 'Available', 'EMP-001', 'Operations', 'Main Office - 2nd Floor', '2026-01-05', 68500, '2029-01-05'],
];

module.exports = (r) => {
  const canImport = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in' });
    if (!can(req.user, 'assets.create') && !can(req.user, 'assets.edit')) return res.status(403).json({ error: 'Permission denied (assets.create or assets.edit)' });
    next();
  };

  r.get('/export', requirePerm('reports.export'), async (req, res) => {
    const assets = listAssets(req.query);
    const rows = exportRows(assets);
    log(req, `Assets exported (${req.query.format === 'csv' ? 'CSV' : 'Excel'})`, 'asset', null, `${assets.length} asset(s)`);
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="assets-${stamp()}.csv"`);
      return res.send(toCsv([...HEADERS, ...INFO_COLUMNS], rows));
    }
    const L = await listsSheet();
    const buf = await writeXlsx([assetSheet(rows, L.lists, INFO_COLUMNS), L.sheet], { title: 'Asset list' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="assets-${stamp()}.xlsx"`);
    res.send(buf);
  });

  r.get('/import/template', canImport, async (req, res) => {
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="asset-import-template.csv"');
      return res.send(toCsv(HEADERS, []));
    }
    const L = await listsSheet();
    const buf = await writeXlsx([assetSheet([], L.lists), { name: 'How to import', lines: INSTRUCTIONS, widths: [16, 22, 14, 10, 14, 14, 11, 12, 14, 24, 13, 13, 13] }, L.sheet], { title: 'Asset import template' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="asset-import-template.xlsx"');
    res.send(buf);
  });

  r.post('/import', canImport, importUpload.single('file'), async (req, res) => {
    if (!req.file) throw bad('Choose an Excel (.xlsx) or CSV file');
    const table = await readTable(req.file, 'Assets');
    const opts = { mode: req.body.mode === 'create_only' ? 'create_only' : 'upsert', createLookups: req.body.create_lookups !== '0' };
    const planned = plan(req, table, opts);
    const fileName = String(req.file.originalname).slice(0, 120);
    if (req.body.commit === '1') {
      const result = commit(req, planned, fileName);
      return res.json({ committed: true, result, ...planned });
    }
    res.json({ committed: false, ...planned });
  });
};

module.exports.COLUMNS = COLUMNS;
module.exports.parseDate = parseDate;
