const express = require('express');
const QRCode = require('qrcode');
const db = require('../db/connection');
const { requirePerm } = require('../lib/auth');
const { log, history, today } = require('../lib/activity');
const { bad, notFound, pick, required, insert, update, diff, upload, setting } = require('../lib/util');
const labels = require('../lib/labels');
const { renderLabelsPdf } = require('../lib/labelsPdf');
const { ASSET_SELECT, decorateAsset, getAsset, relationship } = require('../lib/queries');
const { nextTag } = require('../lib/tags');
const { normalizeMac, MAC_RE } = require('../lib/ip');

const r = express.Router();

const STATUSES = ['Available', 'Deployed', 'Under Repair', 'Damaged', 'Lost', 'Retired', 'Disposed'];
const FIELDS = ['asset_tag', 'name', 'category_id', 'brand', 'model', 'serial_number', 'service_tag', 'description',
  'supplier', 'purchase_date', 'purchase_cost', 'po_number', 'invoice_number', 'department_id', 'location_id',
  'current_location', 'mac_address', 'connected_device_id', 'status', 'notes'];
const NUMERIC = ['category_id', 'purchase_cost', 'department_id', 'location_id', 'connected_device_id'];

function validate(data, { creating }) {
  if (creating) required(data, { name: 'Asset name', category_id: 'Category' });
  if (data.status && !STATUSES.includes(data.status)) throw bad('Invalid status');
  if (data.mac_address) {
    if (!MAC_RE.test(data.mac_address)) throw bad('MAC address must look like AA:BB:CC:DD:EE:FF');
    data.mac_address = normalizeMac(data.mac_address);
  }
  if (data.asset_tag) data.asset_tag = data.asset_tag.toUpperCase();
}

r.get('/', requirePerm('assets.view'), (req, res) => {
  const q = req.query;
  const where = [];
  const p = [];
  if (q.q) {
    where.push(`(a.asset_tag LIKE ? OR a.name LIKE ? OR a.serial_number LIKE ? OR a.brand LIKE ? OR a.model LIKE ? OR e.full_name LIKE ? OR ip.address LIKE ?)`);
    for (let i = 0; i < 7; i++) p.push(`%${q.q}%`);
  }
  if (q.status) { where.push('a.status = ?'); p.push(q.status); }
  if (q.category_id) { where.push('a.category_id = ?'); p.push(q.category_id); }
  if (q.type_group) { where.push('c.type_group = ?'); p.push(q.type_group); }
  if (q.department_id) { where.push('a.department_id = ?'); p.push(q.department_id); }
  if (q.location_id) { where.push('a.location_id = ?'); p.push(q.location_id); }
  if (q.employee_id) { where.push('e.id = ?'); p.push(q.employee_id); }
  if (q.active === '1') where.push("a.status NOT IN ('Retired','Disposed')");
  const rows = db.all(`${ASSET_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.asset_tag`, ...p).map(decorateAsset);
  res.json(q.warranty ? rows.filter((a) => a.warranty_status === q.warranty) : rows);
});

r.get('/next-tag', requirePerm('assets.view'), (req, res) => {
  res.json({ tag: nextTag(Number(req.query.category_id)) });
});

// ───────── Printable QR labels ─────────
function labelBase(req) {
  const b = req.query.base || req.query.origin;
  return b && labels.BASE_RE.test(b) ? b : (setting('qr_base_url') || `${req.protocol}://${req.get('host')}`);
}

r.get('/labels/sizes', requirePerm('assets.view'), (_req, res) => {
  res.json({ sizes: labels.SIZES, default_base: setting('qr_base_url') || null });
});

r.get('/labels.pdf', requirePerm('assets.view'), (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);
  if (!ids.length) throw bad('Select at least one asset');
  if (ids.length > 500) throw bad('Print at most 500 assets at a time');
  const byId = new Map(db.all(`SELECT id, asset_tag, name, serial_number FROM assets WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).map((a) => [a.id, a]));
  const assets = ids.map((id) => byId.get(id)).filter(Boolean);
  const size = labels.sizeByKey(req.query.size);
  const on = (k, def) => (req.query[k] === undefined ? def : req.query[k] === '1');
  const options = {
    mode: req.query.mode === 'tag' ? 'tag' : 'url', base: labelBase(req),
    company: on('company', true), name: on('name', true), serial: on('serial', false), cut: on('cut', false),
    companyName: setting('company_name', ''),
    copies: Math.min(Math.max(Number(req.query.copies) || 1, 1), 20),
    skip: Math.min(Math.max(Number(req.query.skip) || 0, 0), size.cols * size.rows - 1),
  };
  log(req, 'Asset labels generated (PDF)', 'asset', null, `${assets.length} asset(s)`, { size: size.key, copies: options.copies });
  renderLabelsPdf(res, { size, assets, options });
});

r.get('/:id', requirePerm('assets.view'), (req, res) => {
  const a = getAsset(req.params.id);
  if (!a) throw notFound('Asset');
  const id = a.id;
  res.json({
    ...a,
    assignments: db.all(`SELECT aa.*, e.full_name AS employee_name, e.employee_code, d.name AS department, l.name AS location
                           FROM asset_assignments aa JOIN employees e ON e.id = aa.employee_id
                           LEFT JOIN departments d ON d.id = aa.department_id LEFT JOIN locations l ON l.id = aa.location_id
                          WHERE aa.asset_id = ? ORDER BY aa.assigned_date DESC, aa.id DESC`, id),
    history: db.all(`SELECT h.*, u.full_name AS user_name FROM asset_history h LEFT JOIN users u ON u.id = h.user_id
                      WHERE h.asset_id = ? ORDER BY h.event_date DESC, h.id DESC`, id),
    maintenance: db.all('SELECT * FROM maintenance_records WHERE asset_id = ? ORDER BY reported_date DESC, id DESC', id),
    warranties: db.all('SELECT * FROM warranty_records WHERE asset_id = ? ORDER BY is_primary DESC, end_date DESC', id),
    ips: db.all(`SELECT ip.*, n.name AS network_name, n.cidr, n.gateway, n.dns_primary, n.dns_secondary
                   FROM ip_addresses ip JOIN networks n ON n.id = ip.network_id WHERE ip.asset_id = ? ORDER BY ip.address_num`, id),
    network_device: db.get('SELECT id, name, device_type, status FROM network_devices WHERE asset_id = ?', id) || null,
    connected_device: a.connected_device_id ? db.get('SELECT id, name, device_type FROM network_devices WHERE id = ?', a.connected_device_id) : null,
    documents: db.all("SELECT id, doc_type, original_name, mime_type, size_bytes, created_at FROM documents WHERE entity_type = 'asset' AND entity_id = ? ORDER BY id DESC", id),
    relationship: relationship(a),
  });
});

r.get('/:id/qr.svg', requirePerm('assets.view'), async (req, res) => {
  const a = getAsset(req.params.id);
  if (!a) throw notFound('Asset');
  // QR carries only the profile link (login still required) or the bare asset number; never credentials.
  const text = labels.qrText(a.asset_tag, { mode: req.query.mode === 'tag' ? 'tag' : 'url', base: labelBase(req) });
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  res.type('image/svg+xml').send(svg);
});

r.post('/', requirePerm('assets.create'), upload.single('photo'), (req, res) => {
  const data = pick(req.body, FIELDS, NUMERIC);
  validate(data, { creating: true });
  if (!data.asset_tag) data.asset_tag = nextTag(data.category_id);
  if (db.get('SELECT 1 FROM assets WHERE asset_tag = ?', data.asset_tag)) throw bad(`Asset tag ${data.asset_tag} already exists`);
  if (data.status === 'Deployed') throw bad('Create the asset as Available, then use Deploy to assign it to an employee');
  data.status = data.status || 'Available';
  if (req.file) data.photo_path = req.file.filename;
  data.created_by = req.user.id;
  const w = pick(req.body, ['warranty_start', 'warranty_end', 'warranty_provider']);

  const id = db.tx(() => {
    const newId = insert('assets', data);
    if (w.warranty_start || w.warranty_end) {
      insert('warranty_records', { asset_id: newId, start_date: w.warranty_start, end_date: w.warranty_end, provider: w.warranty_provider || data.brand, is_primary: 1 });
    }
    if (data.purchase_date) history(req, newId, 'Purchased', `Purchased${data.supplier ? ` from ${data.supplier}` : ''}`, data.purchase_date);
    history(req, newId, 'Created', `Added to inventory as ${data.asset_tag} (${data.status})`, today());
    log(req, 'Asset created', 'asset', newId, data.asset_tag, { name: data.name });
    return newId;
  });
  res.status(201).json(getAsset(id));
});

r.put('/:id', requirePerm('assets.edit'), upload.single('photo'), (req, res) => {
  const old = db.get('SELECT * FROM assets WHERE id = ?', req.params.id);
  if (!old) throw notFound('Asset');
  const data = pick(req.body, FIELDS, NUMERIC);
  validate(data, { creating: false });
  if (data.asset_tag && data.asset_tag !== old.asset_tag && db.get('SELECT 1 FROM assets WHERE asset_tag = ?', data.asset_tag)) throw bad(`Asset tag ${data.asset_tag} already exists`);
  if (data.status && data.status !== old.status) {
    const active = db.get("SELECT 1 FROM asset_assignments WHERE asset_id = ? AND status = 'Active'", old.id);
    if (data.status === 'Deployed' && !active) throw bad('Use the Deploy workflow to assign the asset to an employee');
    if (active && data.status !== 'Deployed' && ['Available', 'Retired', 'Disposed'].includes(data.status)) throw bad('Asset is still assigned — return it first');
  }
  if (req.file) data.photo_path = req.file.filename;
  const w = pick(req.body, ['warranty_start', 'warranty_end', 'warranty_provider']);
  const changed = diff(old, data);

  db.tx(() => {
    update('assets', old.id, data);
    if ('warranty_start' in w || 'warranty_end' in w) {
      const pw = db.get('SELECT * FROM warranty_records WHERE asset_id = ? AND is_primary = 1', old.id);
      if (pw) update('warranty_records', pw.id, { start_date: w.warranty_start ?? null, end_date: w.warranty_end ?? null, ...(w.warranty_provider ? { provider: w.warranty_provider } : {}) }, { touch: false });
      else if (w.warranty_start || w.warranty_end) insert('warranty_records', { asset_id: old.id, start_date: w.warranty_start, end_date: w.warranty_end, provider: w.warranty_provider || old.brand, is_primary: 1 });
    }
    if (data.status && data.status !== old.status) history(req, old.id, 'Status Changed', `Status changed from ${old.status} to ${data.status}`);
    if (changed.length) {
      history(req, old.id, 'Updated', `Details updated (${changed.filter((c) => c !== 'status').join(', ') || 'status'})`);
      log(req, 'Asset edited', 'asset', old.id, data.asset_tag || old.asset_tag, { fields: changed.join(', ') });
    }
  });
  res.json(getAsset(old.id));
});

r.post('/:id/retire', requirePerm('assets.retire'), (req, res) => {
  const a = getAsset(req.params.id);
  if (!a) throw notFound('Asset');
  if (a.assignment_id) throw bad('Asset is still assigned — return it before retiring');
  const status = req.body.status === 'Disposed' ? 'Disposed' : 'Retired';
  const date = req.body.date || today();
  db.tx(() => {
    update('assets', a.id, { status });
    db.run("UPDATE ip_addresses SET asset_id = NULL, status = 'Available', updated_at = datetime('now') WHERE asset_id = ?", a.id);
    history(req, a.id, status, `${status}${req.body.reason ? ` — ${req.body.reason}` : ''}`, date);
    log(req, `Asset ${status.toLowerCase()}`, 'asset', a.id, a.asset_tag, { reason: req.body.reason });
  });
  res.json(getAsset(a.id));
});

// Hard delete only for records entered by mistake (no assignment history). Otherwise retire.
r.delete('/:id', requirePerm('assets.retire'), (req, res) => {
  const a = db.get('SELECT * FROM assets WHERE id = ?', req.params.id);
  if (!a) throw notFound('Asset');
  if (db.get('SELECT 1 FROM asset_assignments WHERE asset_id = ?', a.id)) throw bad('This asset has assignment history and cannot be deleted. Retire it instead.');
  db.tx(() => {
    db.run('UPDATE network_devices SET asset_id = NULL WHERE asset_id = ?', a.id);
    db.run('DELETE FROM assets WHERE id = ?', a.id);
    log(req, 'Asset deleted', 'asset', a.id, a.asset_tag, { name: a.name });
  });
  res.json({ ok: true });
});

module.exports = r;
