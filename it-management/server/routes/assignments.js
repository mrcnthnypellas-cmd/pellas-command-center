// Deploy / Return / Transfer workflows. Assignment rows are never deleted.
const express = require('express');
const db = require('../db/connection');
const { requirePerm } = require('../lib/auth');
const { log, history, today } = require('../lib/activity');
const { bad, notFound, pick, required, insert, update, upload, fileUrl } = require('../lib/util');
const { getAsset } = require('../lib/queries');

const r = express.Router();

const employee = (id) => {
  const e = db.get('SELECT * FROM employees WHERE id = ?', id);
  if (!e) throw notFound('Employee');
  return e;
};

r.get('/', requirePerm('assets.view'), (req, res) => {
  const where = [];
  const p = [];
  if (req.query.status) { where.push('aa.status = ?'); p.push(req.query.status); }
  if (req.query.employee_id) { where.push('aa.employee_id = ?'); p.push(req.query.employee_id); }
  if (req.query.asset_id) { where.push('aa.asset_id = ?'); p.push(req.query.asset_id); }
  if (req.query.q) { where.push('(a.asset_tag LIKE ? OR a.name LIKE ? OR e.full_name LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  res.json(db.all(`SELECT aa.*, a.asset_tag, a.name AS asset_name, c.name AS category, e.full_name AS employee_name, e.employee_code,
                          d.name AS department, l.name AS location
                     FROM asset_assignments aa JOIN assets a ON a.id = aa.asset_id JOIN asset_categories c ON c.id = a.category_id
                     JOIN employees e ON e.id = aa.employee_id
                     LEFT JOIN departments d ON d.id = aa.department_id LEFT JOIN locations l ON l.id = aa.location_id
                     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY aa.assigned_date DESC, aa.id DESC`, ...p));
});

r.post('/deploy', requirePerm('assets.assign'), (req, res) => {
  const d = pick(req.body, ['asset_id', 'employee_id', 'department_id', 'location_id', 'assigned_date', 'condition_on_assign', 'issued_by', 'notes'],
    ['asset_id', 'employee_id', 'department_id', 'location_id']);
  required(d, { asset_id: 'Asset', employee_id: 'Employee' });
  const a = getAsset(d.asset_id);
  if (!a) throw notFound('Asset');
  if (a.assignment_id) throw bad(`${a.asset_tag} is already assigned to ${a.employee_name}. Use Transfer instead.`);
  if (a.status !== 'Available') throw bad(`${a.asset_tag} is ${a.status} and cannot be deployed`);
  const e = employee(d.employee_id);
  if (e.status !== 'Active') throw bad(`${e.full_name} is ${e.status}`);
  d.assigned_date = d.assigned_date || today();
  d.department_id = d.department_id || e.department_id;
  d.location_id = d.location_id || e.location_id || a.location_id;
  d.issued_by = d.issued_by || req.user.full_name;
  d.status = 'Active';
  d.created_by = req.user.id;

  const id = db.tx(() => {
    const aid = insert('asset_assignments', d);
    update('assets', a.id, { status: 'Deployed', department_id: d.department_id, location_id: d.location_id });
    history(req, a.id, 'Assigned', `Assigned to ${e.full_name} (${e.employee_code})${d.condition_on_assign ? ` — condition: ${d.condition_on_assign}` : ''}`, d.assigned_date);
    log(req, 'Asset assigned', 'asset', a.id, a.asset_tag, { to: e.full_name });
    return aid;
  });
  res.status(201).json({ id, asset: getAsset(a.id) });
});

r.post('/return', requirePerm('assets.assign'), upload.single('photo'), (req, res) => {
  const d = pick(req.body, ['asset_id', 'return_date', 'condition_on_return', 'received_by', 'notes', 'resulting_status'], ['asset_id']);
  required(d, { asset_id: 'Asset' });
  const a = getAsset(d.asset_id);
  if (!a) throw notFound('Asset');
  if (!a.assignment_id) throw bad(`${a.asset_tag} is not currently assigned`);
  const status = d.resulting_status || 'Available';
  if (!['Available', 'Damaged', 'Under Repair', 'Lost'].includes(status)) throw bad('Invalid status after return');
  const date = d.return_date || today();

  const id = db.tx(() => {
    db.run("UPDATE asset_assignments SET status = 'Returned', ended_date = ? WHERE id = ?", date, a.assignment_id);
    const rid = insert('asset_returns', {
      assignment_id: a.assignment_id, asset_id: a.id, employee_id: a.employee_id, return_date: date,
      condition_on_return: d.condition_on_return, received_by: d.received_by || req.user.full_name,
      resulting_status: status, notes: d.notes, photo_path: req.file ? req.file.filename : null, created_by: req.user.id,
    });
    update('assets', a.id, { status });
    history(req, a.id, 'Returned', `Returned by ${a.employee_name}${d.condition_on_return ? ` — condition: ${d.condition_on_return}` : ''} → ${status}`, date);
    log(req, 'Asset returned', 'asset', a.id, a.asset_tag, { from: a.employee_name, status });
    return rid;
  });
  res.status(201).json({ id, asset: getAsset(a.id) });
});

r.post('/transfer', requirePerm('assets.assign'), (req, res) => {
  const d = pick(req.body, ['asset_id', 'to_employee_id', 'transfer_date', 'reason', 'approved_by', 'notes', 'department_id', 'location_id'],
    ['asset_id', 'to_employee_id', 'department_id', 'location_id']);
  required(d, { asset_id: 'Asset', to_employee_id: 'New employee' });
  const a = getAsset(d.asset_id);
  if (!a) throw notFound('Asset');
  if (!a.assignment_id) throw bad(`${a.asset_tag} is not assigned to anyone — use Deploy instead`);
  if (a.employee_id === d.to_employee_id) throw bad('Asset is already assigned to this employee');
  const to = employee(d.to_employee_id);
  if (to.status !== 'Active') throw bad(`${to.full_name} is ${to.status}`);
  const date = d.transfer_date || today();

  const id = db.tx(() => {
    db.run("UPDATE asset_assignments SET status = 'Transferred', ended_date = ? WHERE id = ?", date, a.assignment_id);
    const newAssign = insert('asset_assignments', {
      asset_id: a.id, employee_id: to.id, department_id: d.department_id || to.department_id,
      location_id: d.location_id || to.location_id || a.location_id, assigned_date: date,
      issued_by: d.approved_by || req.user.full_name, notes: `Transferred from ${a.employee_name}${d.reason ? ` — ${d.reason}` : ''}`,
      status: 'Active', created_by: req.user.id,
    });
    const tid = insert('asset_transfers', {
      asset_id: a.id, from_employee_id: a.employee_id, to_employee_id: to.id, from_assignment_id: a.assignment_id,
      to_assignment_id: newAssign, transfer_date: date, reason: d.reason, approved_by: d.approved_by, notes: d.notes, created_by: req.user.id,
    });
    update('assets', a.id, { department_id: d.department_id || to.department_id, location_id: d.location_id || to.location_id || a.location_id });
    history(req, a.id, 'Transferred', `Transferred from ${a.employee_name} to ${to.full_name}${d.reason ? ` — ${d.reason}` : ''}`, date);
    log(req, 'Asset transferred', 'asset', a.id, a.asset_tag, { from: a.employee_name, to: to.full_name });
    return tid;
  });
  res.status(201).json({ id, asset: getAsset(a.id) });
});

r.get('/returns', requirePerm('assets.view'), (_req, res) => {
  res.json(db.all(`SELECT r.*, a.asset_tag, a.name AS asset_name, e.full_name AS employee_name
                     FROM asset_returns r JOIN assets a ON a.id = r.asset_id JOIN employees e ON e.id = r.employee_id
                    ORDER BY r.return_date DESC, r.id DESC`).map((x) => ({ ...x, photo_url: fileUrl(x.photo_path) })));
});

r.get('/transfers', requirePerm('assets.view'), (_req, res) => {
  res.json(db.all(`SELECT t.*, a.asset_tag, a.name AS asset_name, f.full_name AS from_employee, t2.full_name AS to_employee
                     FROM asset_transfers t JOIN assets a ON a.id = t.asset_id
                     JOIN employees f ON f.id = t.from_employee_id JOIN employees t2 ON t2.id = t.to_employee_id
                    ORDER BY t.transfer_date DESC, t.id DESC`));
});

module.exports = r;
