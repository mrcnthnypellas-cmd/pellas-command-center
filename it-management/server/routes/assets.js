const express = require('express');
const QRCode = require('qrcode');
const db = require('../db/connection');
const { requirePerm } = require('../lib/auth');
const { log, history, today } = require('../lib/activity');
const { bad, notFound, pick, update, upload, setting } = require('../lib/util');
const labels = require('../lib/labels');
const { renderLabelsPdf } = require('../lib/labelsPdf');
const { getAsset, relationship } = require('../lib/queries');
const { nextTag } = require('../lib/tags');

const r = express.Router();

const { FIELDS, NUMERIC, WARRANTY_FIELDS, createAsset, updateAsset } = require('../lib/assetService');
const { listAssets } = require('../lib/assetQueries');

r.get('/', requirePerm('assets.view'), (req, res) => {
  res.json(listAssets(req.query));
});

// Spreadsheet import / export (registered before '/:id' so their paths win).
require('./assetImport')(r);

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
  if (req.file) data.photo_path = req.file.filename;
  const id = createAsset(req, data, pick(req.body, WARRANTY_FIELDS));
  res.status(201).json(getAsset(id));
});

r.put('/:id', requirePerm('assets.edit'), upload.single('photo'), (req, res) => {
  const old = db.get('SELECT * FROM assets WHERE id = ?', req.params.id);
  if (!old) throw notFound('Asset');
  const data = pick(req.body, FIELDS, NUMERIC);
  if (req.file) data.photo_path = req.file.filename;
  updateAsset(req, old, data, pick(req.body, WARRANTY_FIELDS));
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
