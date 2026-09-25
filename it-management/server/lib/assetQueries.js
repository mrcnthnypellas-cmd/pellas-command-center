// Filtered asset list, shared by the asset table and the spreadsheet export.
const db = require('../db/connection');
const { ASSET_SELECT, decorateAsset } = require('./queries');

function listAssets(q = {}) {
  const where = [];
  const p = [];
  if (q.q) {
    where.push('(a.asset_tag LIKE ? OR a.name LIKE ? OR a.serial_number LIKE ? OR a.brand LIKE ? OR a.model LIKE ? OR e.full_name LIKE ? OR ip.address LIKE ?)');
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
  return q.warranty ? rows.filter((a) => a.warranty_status === q.warranty) : rows;
}

module.exports = { listAssets };
