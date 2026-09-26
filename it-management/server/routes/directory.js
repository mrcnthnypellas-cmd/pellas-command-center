// Phone directory: company contacts (vendors, ISPs, emergency numbers, internal lines),
// optionally listed together with employees' numbers. Exportable to Excel / CSV.
const express = require('express');
const db = require('../db/connection');
const { requirePerm } = require('../lib/auth');
const { log } = require('../lib/activity');
const { bad, notFound, pick, insert, update, diff, setting } = require('../lib/util');
const { toCsv, writeXlsx } = require('../lib/spreadsheet');

const r = express.Router();
const view = requirePerm('directory.view');
const manage = requirePerm('directory.manage');

const CATEGORIES = ['Internal', 'Vendor / Supplier', 'ISP / Telco', 'Emergency', 'Client', 'Government', 'Other'];
const FIELDS = ['name', 'organization', 'department', 'position', 'phone', 'mobile', 'local_ext', 'email', 'category', 'notes', 'is_favorite'];
const PHONE_RE = /^[0-9+()\-.\s/#*]{3,40}$/; // digits and the usual separators; "ext" goes in its own field

function validate(d, creating) {
  if (creating || 'name' in d) { if (!d.name) throw bad('Name is required'); if (d.name.length > 120) throw bad('Name is too long'); }
  for (const f of ['phone', 'mobile']) if (d[f] && !PHONE_RE.test(d[f])) throw bad(`${f === 'phone' ? 'Phone' : 'Mobile'} number can only contain digits, spaces and + ( ) - .`);
  if (d.local_ext && d.local_ext.length > 20) throw bad('Local / extension is too long');
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw bad('Email address looks wrong');
  if (d.category && !CATEGORIES.includes(d.category)) throw bad('Unknown category');
  if ('is_favorite' in d) d.is_favorite = d.is_favorite ? 1 : 0;
}

function list(q) {
  const where = []; const p = [];
  if (q.q) { where.push('(name LIKE ? OR organization LIKE ? OR department LIKE ? OR position LIKE ? OR phone LIKE ? OR mobile LIKE ? OR local_ext LIKE ? OR email LIKE ?)'); for (let i = 0; i < 8; i++) p.push(`%${q.q}%`); }
  if (q.category && q.category !== 'Employees') { where.push('category = ?'); p.push(q.category); }
  let rows = q.category === 'Employees' ? [] : db.all(`SELECT *, 'contact' AS source FROM phone_contacts ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`, ...p);
  if (q.include_employees === '1' || q.category === 'Employees') {
    const ew = ["e.status IN ('Active','On Leave')", "COALESCE(e.contact_number, '') != ''"]; const ep = [];
    if (q.q) { ew.push('(e.full_name LIKE ? OR e.position LIKE ? OR d.name LIKE ? OR e.contact_number LIKE ? OR e.email LIKE ?)'); for (let i = 0; i < 5; i++) ep.push(`%${q.q}%`); }
    rows = rows.concat(db.all(`SELECT e.id, e.full_name AS name, ? AS organization, d.name AS department, e.position, e.contact_number AS mobile, NULL AS phone,
        NULL AS local_ext, e.email, 'Employees' AS category, e.employee_code AS notes, 0 AS is_favorite, 'employee' AS source
        FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE ${ew.join(' AND ')}`, setting('company_name', ''), ...ep));
  }
  return rows.sort((a, b) => (b.is_favorite - a.is_favorite) || a.name.localeCompare(b.name));
}

r.get('/', view, (req, res) => res.json({ categories: CATEGORIES, contacts: list(req.query) }));

const HEADERS = ['Name', 'Company / Office', 'Department', 'Position', 'Phone', 'Mobile', 'Local / Ext.', 'Email', 'Category', 'Notes'];
const row = (c) => [c.name, c.organization, c.department, c.position, c.phone, c.mobile, c.local_ext, c.email, c.category, c.notes].map((v) => v ?? '');

r.get('/export', view, async (req, res) => {
  const rows = list(req.query);
  const stamp = new Date().toISOString().slice(0, 10);
  log(req, `Phone directory exported (${req.query.format === 'csv' ? 'CSV' : 'Excel'})`, 'directory', null, `${rows.length} contact(s)`);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="phone-directory-${stamp}.csv"`);
    return res.send(toCsv(HEADERS, rows.map(row)));
  }
  const buf = await writeXlsx([{ name: 'Phone Directory', headers: HEADERS, rows: rows.map(row), widths: [28, 26, 18, 20, 18, 18, 11, 28, 16, 30] }], { title: 'Phone directory' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="phone-directory-${stamp}.xlsx"`);
  res.send(buf);
});

r.post('/', manage, (req, res) => {
  const d = pick(req.body, FIELDS);
  d.category = d.category || 'Other';
  validate(d, true);
  if (!d.phone && !d.mobile && !d.local_ext) throw bad('Enter at least one number (phone, mobile or local)');
  d.created_by = req.user.id;
  const id = insert('phone_contacts', d);
  log(req, 'Contact added', 'directory', id, d.name);
  res.status(201).json(db.get('SELECT * FROM phone_contacts WHERE id = ?', id));
});

r.put('/:id', manage, (req, res) => {
  const old = db.get('SELECT * FROM phone_contacts WHERE id = ?', req.params.id);
  if (!old) throw notFound('Contact');
  const d = pick(req.body, FIELDS);
  validate(d, false);
  const merged = { ...old, ...d };
  if (!merged.phone && !merged.mobile && !merged.local_ext) throw bad('Enter at least one number (phone, mobile or local)');
  const changed = diff(old, d);
  update('phone_contacts', old.id, d);
  if (changed.length && !(changed.length === 1 && changed[0] === 'is_favorite')) log(req, 'Contact edited', 'directory', old.id, merged.name, { fields: changed.join(', ') });
  res.json(db.get('SELECT * FROM phone_contacts WHERE id = ?', old.id));
});

r.delete('/:id', manage, (req, res) => {
  const old = db.get('SELECT * FROM phone_contacts WHERE id = ?', req.params.id);
  if (!old) throw notFound('Contact');
  db.run('DELETE FROM phone_contacts WHERE id = ?', old.id);
  log(req, 'Contact deleted', 'directory', old.id, old.name);
  res.json({ ok: true });
});

module.exports = r;
