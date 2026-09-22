const express = require('express');
const db = require('../db/connection');
const { requirePerm } = require('../lib/auth');
const { log } = require('../lib/activity');
const { bad, notFound, pick, required, insert, update, diff, upload, fileUrl } = require('../lib/util');
const { ASSET_SELECT, decorateAsset } = require('../lib/queries');

const r = express.Router();
const FIELDS = ['employee_code', 'full_name', 'position', 'department_id', 'email', 'contact_number', 'location_id', 'status'];
const NUM = ['department_id', 'location_id'];

const SELECT = `SELECT e.*, d.name AS department, l.name AS location,
                  (SELECT COUNT(*) FROM asset_assignments aa WHERE aa.employee_id = e.id AND aa.status = 'Active') AS asset_count
                  FROM employees e LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN locations l ON l.id = e.location_id`;
const decorate = (e) => e && { ...e, photo_url: fileUrl(e.photo_path) };

function nextCode() {
  let max = 0;
  for (const { employee_code } of db.all("SELECT employee_code FROM employees WHERE employee_code LIKE 'EMP-%'")) {
    const n = Number(employee_code.slice(4));
    if (n > max) max = n;
  }
  return `EMP-${String(max + 1).padStart(3, '0')}`;
}

r.get('/', requirePerm('employees.view'), (req, res) => {
  const where = [];
  const p = [];
  if (req.query.q) { where.push('(e.full_name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ? OR e.position LIKE ?)'); for (let i = 0; i < 4; i++) p.push(`%${req.query.q}%`); }
  if (req.query.department_id) { where.push('e.department_id = ?'); p.push(req.query.department_id); }
  if (req.query.status) { where.push('e.status = ?'); p.push(req.query.status); }
  let rows = db.all(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.full_name`, ...p).map(decorate);
  if (req.query.has_assets === '1') rows = rows.filter((e) => e.asset_count > 0);
  if (req.query.has_assets === '0') rows = rows.filter((e) => e.asset_count === 0);
  res.json(rows);
});

r.get('/next-code', requirePerm('employees.view'), (_req, res) => res.json({ code: nextCode() }));

r.get('/:id', requirePerm('employees.view'), (req, res) => {
  const e = decorate(db.get(`${SELECT} WHERE e.id = ?`, req.params.id));
  if (!e) throw notFound('Employee');
  res.json({
    ...e,
    assets: db.all(`${ASSET_SELECT} WHERE e.id = ? ORDER BY c.name, a.asset_tag`, e.id).map(decorateAsset),
    assignment_history: db.all(`SELECT aa.*, a.asset_tag, a.name AS asset_name, c.name AS category
                                  FROM asset_assignments aa JOIN assets a ON a.id = aa.asset_id JOIN asset_categories c ON c.id = a.category_id
                                 WHERE aa.employee_id = ? ORDER BY aa.assigned_date DESC, aa.id DESC`, e.id),
    returns: db.all(`SELECT r.*, a.asset_tag, a.name AS asset_name FROM asset_returns r JOIN assets a ON a.id = r.asset_id
                      WHERE r.employee_id = ? ORDER BY r.return_date DESC`, e.id),
    transfers: db.all(`SELECT t.*, a.asset_tag, a.name AS asset_name, f.full_name AS from_employee, t2.full_name AS to_employee
                         FROM asset_transfers t JOIN assets a ON a.id = t.asset_id JOIN employees f ON f.id = t.from_employee_id
                         JOIN employees t2 ON t2.id = t.to_employee_id WHERE t.from_employee_id = ? OR t.to_employee_id = ?
                        ORDER BY t.transfer_date DESC`, e.id, e.id),
  });
});

r.post('/', requirePerm('employees.manage'), upload.single('photo'), (req, res) => {
  const d = pick(req.body, FIELDS, NUM);
  required(d, { full_name: 'Full name' });
  d.employee_code = (d.employee_code || nextCode()).toUpperCase();
  if (db.get('SELECT 1 FROM employees WHERE employee_code = ?', d.employee_code)) throw bad(`Employee ID ${d.employee_code} already exists`);
  d.status = d.status || 'Active';
  if (req.file) d.photo_path = req.file.filename;
  const id = insert('employees', d);
  log(req, 'Employee created', 'employee', id, d.full_name, { code: d.employee_code });
  res.status(201).json(decorate(db.get(`${SELECT} WHERE e.id = ?`, id)));
});

r.put('/:id', requirePerm('employees.manage'), upload.single('photo'), (req, res) => {
  const old = db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
  if (!old) throw notFound('Employee');
  const d = pick(req.body, FIELDS, NUM);
  if (d.employee_code) {
    d.employee_code = d.employee_code.toUpperCase();
    if (d.employee_code !== old.employee_code && db.get('SELECT 1 FROM employees WHERE employee_code = ?', d.employee_code)) throw bad('Employee ID already exists');
  }
  if (d.status && d.status !== 'Active' && old.status === 'Active') {
    const n = db.get("SELECT COUNT(*) n FROM asset_assignments WHERE employee_id = ? AND status = 'Active'", old.id).n;
    if (n && ['Resigned', 'Inactive'].includes(d.status)) throw bad(`${old.full_name} still has ${n} assigned asset(s). Return or transfer them first.`);
  }
  if (req.file) d.photo_path = req.file.filename;
  const changed = diff(old, d);
  update('employees', old.id, d);
  if (changed.length) log(req, 'Employee edited', 'employee', old.id, d.full_name || old.full_name, { fields: changed.join(', ') });
  res.json(decorate(db.get(`${SELECT} WHERE e.id = ?`, old.id)));
});

r.delete('/:id', requirePerm('employees.manage'), (req, res) => {
  const e = db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
  if (!e) throw notFound('Employee');
  if (db.get('SELECT 1 FROM asset_assignments WHERE employee_id = ?', e.id)) throw bad('Employee has assignment history and cannot be deleted. Set status to Inactive/Resigned instead.');
  db.run('DELETE FROM employees WHERE id = ?', e.id);
  log(req, 'Employee deleted', 'employee', e.id, e.full_name);
  res.json({ ok: true });
});

module.exports = r;
