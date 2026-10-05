// Company settings + lookup tables (departments, locations, categories) + lookups for forms.
const express = require('express');
const db = require('../db/connection');
const { requireAuth, requirePerm } = require('../lib/auth');
const { log } = require('../lib/activity');
const { bad, notFound, pick, required, insert, update, upload, setting } = require('../lib/util');
const { branding, LOGIN_PRESETS } = require('../lib/branding');

const r = express.Router();
const manage = requirePerm('settings.manage');

const COMPANY_KEYS = ['company_name', 'company_address', 'company_phone', 'company_email', 'company_website',
  'tag_padding', 'tag_separator', 'warranty_alert_days', 'contract_alert_days', 'currency_symbol', 'qr_base_url', 'auto_serial', 'auto_service_tag'];

r.get('/company', requireAuth, (_req, res) => {
  const out = Object.fromEntries(COMPANY_KEYS.map((k) => [k, setting(k)]));
  out.auto_serial = setting('auto_serial', '1'); out.auto_service_tag = setting('auto_service_tag', '1');
  out.company_logo_url = branding().logo_url;
  res.json(out);
});

r.put('/company', manage, upload.single('logo'), (req, res) => {
  const d = pick(req.body, COMPANY_KEYS);
  if (d.tag_padding && !(Number(d.tag_padding) >= 2 && Number(d.tag_padding) <= 8)) throw bad('Tag number padding must be 2–8 digits');
  if (d.qr_base_url && !/^https?:\/\/[^\s"<>#?]+$/.test(d.qr_base_url)) throw bad('QR link address must look like http://192.168.1.50:4000');
  db.tx(() => {
    for (const [k, v] of Object.entries(d)) db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, typeof v === 'number' ? String(v) : v);
    if (req.file) {
      if (!/^image\//.test(req.file.mimetype)) throw bad('The logo must be an image (PNG, JPG or WebP)');
      saveSetting('company_logo', req.file.filename);
      saveSetting('company_logo_mime', req.file.mimetype);
      bumpVersion();
    }
  });
  log(req, 'Company settings updated', 'settings', null, 'Company', { fields: Object.keys(d).join(', ') });
  res.json({ ok: true });
});

function saveSetting(k, v) {
  db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v);
}
const bumpVersion = () => saveSetting('branding_version', String(Date.now()));

// Names shown in the app + the sign-in page look.
r.get('/branding', requireAuth, (_req, res) => res.json(branding()));

const BRAND_LIMITS = { company_name: 80, system_name: 60, dashboard_title: 60, dashboard_subtitle: 200, login_message: 200 };
r.put('/branding', manage, upload.single('login_bg'), (req, res) => {
  const d = {};
  for (const [k, max] of Object.entries(BRAND_LIMITS)) {
    if (!(k in (req.body || {}))) continue;
    const v = String(req.body[k] ?? '').trim();
    if (v.length > max) throw bad(`${k.replace(/_/g, ' ')} must be ${max} characters or fewer`);
    if (['company_name', 'system_name', 'dashboard_title'].includes(k) && !v) throw bad(`${k.replace(/_/g, ' ')} can't be empty`);
    d[k] = v;
  }
  if (req.body.login_bg_preset !== undefined) {
    if (!LOGIN_PRESETS[req.body.login_bg_preset]) throw bad('Unknown background colour');
    d.login_bg_preset = req.body.login_bg_preset;
  }
  if (req.file && !/^image\/(png|jpe?g|webp|gif)$/.test(req.file.mimetype)) throw bad('The background must be a PNG, JPG or WebP image');
  db.tx(() => {
    for (const [k, v] of Object.entries(d)) saveSetting(k, v);
    if (req.file) { saveSetting('login_bg', req.file.filename); saveSetting('login_bg_mime', req.file.mimetype); }
    if (req.body.remove_login_bg === '1' && !req.file) saveSetting('login_bg', null);
    bumpVersion();
  });
  const fields = [...Object.keys(d), ...(req.file ? ['login background image'] : []), ...(req.body.remove_login_bg === '1' ? ['login background removed'] : [])];
  log(req, 'Branding updated', 'settings', null, 'Branding', { fields: fields.join(', ') });
  res.json(branding());
});

// Every dropdown the UI needs in one call.
r.get('/lookups', requireAuth, (_req, res) => {
  res.json({
    departments: db.all('SELECT id, name FROM departments ORDER BY name'),
    locations: db.all('SELECT id, name, building, floor, room FROM locations ORDER BY name'),
    categories: db.all('SELECT id, name, prefix, type_group, is_network FROM asset_categories ORDER BY name'),
    employees: db.all("SELECT id, employee_code, full_name, department_id, location_id, status FROM employees ORDER BY full_name"),
    networks: db.all('SELECT id, name, cidr FROM networks ORDER BY name'),
    isps: db.all('SELECT id, provider_name, connection_name, role FROM isps ORDER BY provider_name'),
    devices: db.all('SELECT id, name, device_type FROM network_devices ORDER BY name'),
    assets: db.all(`SELECT a.id, a.asset_tag, a.name, a.status, c.is_network FROM assets a JOIN asset_categories c ON c.id = a.category_id ORDER BY a.asset_tag`),
    currency: setting('currency_symbol', '₱'),
    auto_ids: { serial: require('../lib/autoIds').autoSerialOn(), service_tag: require('../lib/autoIds').autoServiceTagOn() },
  });
});

// Generic CRUD for simple lookup tables.
function lookupCrud(path, table, fields, label, { requiredFields, inUse, numeric = [] }) {
  r.get(`/${path}`, requireAuth, (_req, res) => res.json(db.all(`SELECT t.*, ${inUse} AS usage FROM ${table} t ORDER BY name`)));
  r.post(`/${path}`, manage, (req, res) => {
    const d = pick(req.body, fields, numeric);
    required(d, requiredFields);
    try {
      const id = insert(table, d);
      log(req, `${label} created`, table, id, d.name);
      res.status(201).json({ id });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw bad(`${label} already exists`);
      throw e;
    }
  });
  r.put(`/${path}/:id`, manage, (req, res) => {
    const old = db.get(`SELECT * FROM ${table} WHERE id = ?`, req.params.id);
    if (!old) throw notFound(label);
    try {
      update(table, old.id, pick(req.body, fields, numeric), { touch: false });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw bad(`${label} already exists`);
      throw e;
    }
    log(req, `${label} updated`, table, old.id, req.body.name || old.name);
    res.json({ ok: true });
  });
  r.delete(`/${path}/:id`, manage, (req, res) => {
    const old = db.get(`SELECT t.*, ${inUse} AS usage FROM ${table} t WHERE id = ?`, req.params.id);
    if (!old) throw notFound(label);
    if (old.usage > 0) throw bad(`${label} "${old.name}" is used by ${old.usage} record(s) and cannot be deleted`);
    db.run(`DELETE FROM ${table} WHERE id = ?`, old.id);
    log(req, `${label} deleted`, table, old.id, old.name);
    res.json({ ok: true });
  });
}

lookupCrud('departments', 'departments', ['name', 'code', 'description'], 'Department', {
  requiredFields: { name: 'Name' },
  inUse: '((SELECT COUNT(*) FROM assets WHERE department_id = t.id) + (SELECT COUNT(*) FROM employees WHERE department_id = t.id))',
});
lookupCrud('locations', 'locations', ['name', 'building', 'floor', 'room', 'address', 'notes'], 'Location', {
  requiredFields: { name: 'Name' },
  inUse: '((SELECT COUNT(*) FROM assets WHERE location_id = t.id) + (SELECT COUNT(*) FROM employees WHERE location_id = t.id) + (SELECT COUNT(*) FROM networks WHERE location_id = t.id))',
});
lookupCrud('categories', 'asset_categories', ['name', 'prefix', 'type_group', 'is_network', 'description'], 'Category', {
  requiredFields: { name: 'Name', prefix: 'Tag prefix' },
  numeric: ['is_network'],
  inUse: '(SELECT COUNT(*) FROM assets WHERE category_id = t.id)',
});

module.exports = r;
