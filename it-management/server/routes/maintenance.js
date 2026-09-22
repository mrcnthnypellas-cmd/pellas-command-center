const express = require('express');
const db = require('../db/connection');
const { requirePerm } = require('../lib/auth');
const { log, history, today } = require('../lib/activity');
const { bad, notFound, pick, required, insert, update, warrantyStatus, daysUntil } = require('../lib/util');
const { ASSET_SELECT, decorateAsset } = require('../lib/queries');

const r = express.Router();
const STATUSES = ['Reported', 'Diagnosis', 'Under Repair', 'Waiting for Parts', 'Completed', 'Unrepairable'];
const ACTIVE = ['Reported', 'Diagnosis', 'Under Repair', 'Waiting for Parts'];
const FIELDS = ['asset_id', 'issue', 'reported_date', 'repair_start', 'repair_end', 'technician', 'vendor', 'repair_cost', 'parts_replaced', 'status', 'notes'];
const NUM = ['asset_id', 'repair_cost'];

// Keeps the asset's status consistent with its maintenance records.
function syncAssetStatus(req, assetId, record) {
  const asset = db.get('SELECT * FROM assets WHERE id = ?', assetId);
  const activeCount = db.get(`SELECT COUNT(*) n FROM maintenance_records WHERE asset_id = ? AND status IN (${ACTIVE.map(() => '?').join(',')})`, assetId, ...ACTIVE).n;
  const assigned = db.get("SELECT 1 FROM asset_assignments WHERE asset_id = ? AND status = 'Active'", assetId);
  let next = asset.status;
  if (activeCount > 0) next = 'Under Repair';
  else if (record.status === 'Unrepairable') next = 'Damaged';
  else if (asset.status === 'Under Repair') next = assigned ? 'Deployed' : 'Available';
  if (next !== asset.status) {
    update('assets', assetId, { status: next });
    const label = next === 'Under Repair' ? `Sent for repair — ${record.issue}` : record.status === 'Completed' ? `Repair completed → ${next}` : `Marked ${next} (${record.status})`;
    history(req, assetId, next === 'Under Repair' ? 'Maintenance' : 'Repair Completed', label, next === 'Under Repair' ? (record.repair_start || record.reported_date) : (record.repair_end || today()));
  }
}

const SELECT = `SELECT m.*, a.asset_tag, a.name AS asset_name, a.status AS asset_status FROM maintenance_records m JOIN assets a ON a.id = m.asset_id`;

r.get('/', requirePerm('maintenance.view'), (req, res) => {
  const where = [];
  const p = [];
  if (req.query.status === 'active') where.push(`m.status IN (${ACTIVE.map((s) => `'${s}'`).join(',')})`);
  else if (req.query.status) { where.push('m.status = ?'); p.push(req.query.status); }
  if (req.query.asset_id) { where.push('m.asset_id = ?'); p.push(req.query.asset_id); }
  if (req.query.q) { where.push('(a.asset_tag LIKE ? OR a.name LIKE ? OR m.issue LIKE ? OR m.technician LIKE ? OR m.vendor LIKE ?)'); for (let i = 0; i < 5; i++) p.push(`%${req.query.q}%`); }
  res.json(db.all(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY m.reported_date DESC, m.id DESC`, ...p));
});

r.post('/', requirePerm('maintenance.manage'), (req, res) => {
  const d = pick(req.body, FIELDS, NUM);
  required(d, { asset_id: 'Asset', issue: 'Issue' });
  d.status = d.status || 'Reported';
  if (!STATUSES.includes(d.status)) throw bad('Invalid status');
  d.reported_date = d.reported_date || today();
  const asset = db.get('SELECT * FROM assets WHERE id = ?', d.asset_id);
  if (!asset) throw notFound('Asset');
  if (['Retired', 'Disposed'].includes(asset.status)) throw bad(`${asset.asset_tag} is ${asset.status}`);
  d.created_by = req.user.id;
  const id = db.tx(() => {
    const mid = insert('maintenance_records', d);
    history(req, asset.id, 'Maintenance', `Issue reported: ${d.issue}`, d.reported_date);
    syncAssetStatus(req, asset.id, d);
    log(req, 'Maintenance logged', 'asset', asset.id, asset.asset_tag, { issue: d.issue, status: d.status });
    return mid;
  });
  res.status(201).json(db.get(`${SELECT} WHERE m.id = ?`, id));
});

r.put('/:id', requirePerm('maintenance.manage'), (req, res) => {
  const old = db.get('SELECT * FROM maintenance_records WHERE id = ?', req.params.id);
  if (!old) throw notFound('Maintenance record');
  const d = pick(req.body, FIELDS.filter((f) => f !== 'asset_id'), NUM);
  if (d.status && !STATUSES.includes(d.status)) throw bad('Invalid status');
  if (d.status === 'Completed' && !d.repair_end && !old.repair_end) d.repair_end = today();
  const asset = db.get('SELECT asset_tag FROM assets WHERE id = ?', old.asset_id);
  db.tx(() => {
    update('maintenance_records', old.id, d);
    const merged = { ...old, ...d };
    if (d.status && d.status !== old.status) {
      log(req, d.status === 'Completed' ? 'Maintenance completed' : 'Maintenance updated', 'asset', old.asset_id, asset.asset_tag, { status: d.status });
    }
    syncAssetStatus(req, old.asset_id, merged);
  });
  res.json(db.get(`${SELECT} WHERE m.id = ?`, old.id));
});

r.delete('/:id', requirePerm('maintenance.manage'), (req, res) => {
  const old = db.get('SELECT * FROM maintenance_records WHERE id = ?', req.params.id);
  if (!old) throw notFound('Maintenance record');
  db.tx(() => {
    db.run('DELETE FROM maintenance_records WHERE id = ?', old.id);
    syncAssetStatus(req, old.asset_id, { ...old, status: 'Completed' });
    log(req, 'Maintenance record deleted', 'asset', old.asset_id, null, { issue: old.issue });
  });
  res.json({ ok: true });
});

// ───────── Warranty ─────────
r.get('/warranty/list', requirePerm('maintenance.view'), (req, res) => {
  const days = Number(req.query.days || 0);
  let rows = db.all(`${ASSET_SELECT} WHERE a.status NOT IN ('Disposed') ORDER BY w.end_date IS NULL, w.end_date`).map(decorateAsset)
    .map((a) => ({ ...a, days_left: daysUntil(a.warranty_end) }));
  const f = req.query.filter;
  if (f === 'active') rows = rows.filter((a) => a.days_left !== null && a.days_left >= 0);
  else if (f === 'expired') rows = rows.filter((a) => a.days_left !== null && a.days_left < 0);
  else if (f === 'expiring') rows = rows.filter((a) => a.days_left !== null && a.days_left >= 0 && a.days_left <= (days || 30));
  else if (f === 'none') rows = rows.filter((a) => a.days_left === null);
  if (days && f !== 'expiring') rows.forEach((a) => { a.warranty_status = warrantyStatus(a.warranty_end, days); });
  res.json(rows);
});

r.post('/warranty', requirePerm('maintenance.manage'), (req, res) => {
  const d = pick(req.body, ['asset_id', 'provider', 'warranty_type', 'start_date', 'end_date', 'reference_no', 'notes'], ['asset_id']);
  required(d, { asset_id: 'Asset', end_date: 'Warranty expiration' });
  const asset = db.get('SELECT * FROM assets WHERE id = ?', d.asset_id);
  if (!asset) throw notFound('Asset');
  d.is_primary = db.get('SELECT 1 FROM warranty_records WHERE asset_id = ?', asset.id) ? 0 : 1;
  const id = insert('warranty_records', d);
  history(req, asset.id, 'Warranty', `Warranty added (${d.warranty_type || 'Manufacturer'}) until ${d.end_date}`);
  log(req, 'Warranty added', 'asset', asset.id, asset.asset_tag, { end_date: d.end_date });
  res.status(201).json({ id });
});

r.put('/warranty/:id', requirePerm('maintenance.manage'), (req, res) => {
  const old = db.get('SELECT * FROM warranty_records WHERE id = ?', req.params.id);
  if (!old) throw notFound('Warranty');
  update('warranty_records', old.id, pick(req.body, ['provider', 'warranty_type', 'start_date', 'end_date', 'reference_no', 'notes']), { touch: false });
  log(req, 'Warranty updated', 'asset', old.asset_id, null, {});
  res.json({ ok: true });
});

r.delete('/warranty/:id', requirePerm('maintenance.manage'), (req, res) => {
  const old = db.get('SELECT * FROM warranty_records WHERE id = ?', req.params.id);
  if (!old) throw notFound('Warranty');
  db.run('DELETE FROM warranty_records WHERE id = ?', old.id);
  log(req, 'Warranty removed', 'asset', old.asset_id, null, {});
  res.json({ ok: true });
});

module.exports = r;
module.exports.ACTIVE = ACTIVE;
