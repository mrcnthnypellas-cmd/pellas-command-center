const express = require('express');
const db = require('../db/connection');
const { requirePerm } = require('../lib/auth');
const { log, history, today } = require('../lib/activity');
const { bad, notFound, pick, required, insert } = require('../lib/util');
const { ASSET_SELECT } = require('../lib/queries');

const r = express.Router();
const RESULTS = ['Pending', 'Found', 'Missing', 'Damaged'];

const SELECT = `SELECT au.*, l.name AS location, d.name AS department, u.full_name AS created_by_name,
    (SELECT COUNT(*) FROM audit_items i WHERE i.audit_id = au.id) AS total,
    (SELECT COUNT(*) FROM audit_items i WHERE i.audit_id = au.id AND i.result = 'Found') AS found,
    (SELECT COUNT(*) FROM audit_items i WHERE i.audit_id = au.id AND i.result = 'Missing') AS missing,
    (SELECT COUNT(*) FROM audit_items i WHERE i.audit_id = au.id AND i.result = 'Damaged') AS damaged,
    (SELECT COUNT(*) FROM audit_items i WHERE i.audit_id = au.id AND i.result = 'Pending') AS pending
  FROM inventory_audits au LEFT JOIN locations l ON l.id = au.location_id LEFT JOIN departments d ON d.id = au.department_id
  LEFT JOIN users u ON u.id = au.created_by`;

r.get('/', requirePerm('audits.view'), (_req, res) => res.json(db.all(`${SELECT} ORDER BY au.audit_date DESC, au.id DESC`)));

r.get('/:id', requirePerm('audits.view'), (req, res) => {
  const au = db.get(`${SELECT} WHERE au.id = ?`, req.params.id);
  if (!au) throw notFound('Audit');
  au.items = db.all(`SELECT i.*, a.asset_tag, a.name AS asset_name, a.serial_number, a.status AS current_status, c.name AS category, u.full_name AS checked_by_name
                       FROM audit_items i JOIN assets a ON a.id = i.asset_id JOIN asset_categories c ON c.id = a.category_id
                       LEFT JOIN users u ON u.id = i.checked_by WHERE i.audit_id = ? ORDER BY a.asset_tag`, au.id);
  res.json(au);
});

// Creating an audit snapshots every in-scope asset into audit_items.
r.post('/', requirePerm('audits.manage'), (req, res) => {
  const d = pick(req.body, ['name', 'audit_date', 'location_id', 'department_id', 'notes'], ['location_id', 'department_id']);
  required(d, { name: 'Audit name' });
  d.audit_date = d.audit_date || today();
  const where = ["a.status NOT IN ('Retired','Disposed')"];
  const p = [];
  if (d.location_id) { where.push('a.location_id = ?'); p.push(d.location_id); }
  if (d.department_id) { where.push('a.department_id = ?'); p.push(d.department_id); }
  const assets = db.all(`${ASSET_SELECT} WHERE ${where.join(' AND ')}`, ...p);
  if (!assets.length) throw bad('No assets match this location/department');
  const id = db.tx(() => {
    const aid = insert('inventory_audits', { ...d, status: 'In Progress', created_by: req.user.id });
    for (const a of assets) {
      insert('audit_items', { audit_id: aid, asset_id: a.id, expected_status: a.status, expected_location: a.location, expected_employee: a.employee_name });
    }
    log(req, 'Inventory audit created', 'audit', aid, d.name, { assets: assets.length });
    return aid;
  });
  res.status(201).json({ id });
});

r.put('/:id/items/:itemId', requirePerm('audits.manage'), (req, res) => {
  const au = db.get('SELECT * FROM inventory_audits WHERE id = ?', req.params.id);
  if (!au) throw notFound('Audit');
  if (au.status === 'Completed') throw bad('Audit is already completed');
  const { result, notes } = req.body;
  if (!RESULTS.includes(result)) throw bad('Invalid result');
  const info = db.run("UPDATE audit_items SET result = ?, notes = ?, checked_by = ?, checked_at = datetime('now') WHERE id = ? AND audit_id = ?",
    result, notes ?? null, req.user.id, req.params.itemId, au.id);
  if (!info.changes) throw notFound('Audit item');
  res.json({ ok: true });
});

r.post('/:id/complete', requirePerm('audits.manage'), (req, res) => {
  const au = db.get('SELECT * FROM inventory_audits WHERE id = ?', req.params.id);
  if (!au) throw notFound('Audit');
  if (au.status === 'Completed') throw bad('Audit is already completed');
  const apply = req.body.apply_statuses !== false;
  db.tx(() => {
    const items = db.all('SELECT i.*, a.asset_tag, a.status FROM audit_items i JOIN assets a ON a.id = i.asset_id WHERE i.audit_id = ?', au.id);
    for (const i of items) {
      if (i.result === 'Pending') continue;
      history(req, i.asset_id, 'Audit', `Inventory audit "${au.name}": ${i.result}${i.notes ? ` — ${i.notes}` : ''}`, au.audit_date);
      if (apply && i.result === 'Missing' && i.status !== 'Lost') {
        db.run("UPDATE assets SET status = 'Lost', updated_at = datetime('now') WHERE id = ?", i.asset_id);
        history(req, i.asset_id, 'Status Changed', `Marked Lost after audit "${au.name}"`, au.audit_date);
      }
      if (apply && i.result === 'Damaged' && !['Damaged', 'Under Repair'].includes(i.status)) {
        db.run("UPDATE assets SET status = 'Damaged', updated_at = datetime('now') WHERE id = ?", i.asset_id);
        history(req, i.asset_id, 'Status Changed', `Marked Damaged after audit "${au.name}"`, au.audit_date);
      }
    }
    db.run("UPDATE inventory_audits SET status = 'Completed', completed_at = datetime('now') WHERE id = ?", au.id);
    log(req, 'Inventory audit completed', 'audit', au.id, au.name, { applied: apply });
  });
  res.json({ ok: true });
});

r.delete('/:id', requirePerm('audits.manage'), (req, res) => {
  const au = db.get('SELECT * FROM inventory_audits WHERE id = ?', req.params.id);
  if (!au) throw notFound('Audit');
  if (au.status === 'Completed') throw bad('Completed audits are kept for the record');
  db.run('DELETE FROM inventory_audits WHERE id = ?', au.id);
  log(req, 'Inventory audit deleted', 'audit', au.id, au.name);
  res.json({ ok: true });
});

module.exports = r;
