const express = require('express');
const db = require('../db/connection');
const { requirePerm, can } = require('../lib/auth');
const { setting, daysUntil } = require('../lib/util');
const { utilization } = require('./network');

const r = express.Router();
const STATUSES = ['Available', 'Deployed', 'Under Repair', 'Damaged', 'Lost', 'Retired', 'Disposed'];
const TYPES = ['Laptop', 'Desktop', 'Monitor', 'Printer', 'Network Device', 'Mobile', 'Server', 'Accessories', 'Other'];

// Every number is computed live from the tables, so it updates as soon as records change.
r.get('/', requirePerm('dashboard.view'), (req, res) => {
  const warrantyDays = Number(setting('warranty_alert_days', 60));
  const contractDays = Number(setting('contract_alert_days', 60));
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const x of db.all('SELECT status, COUNT(*) n FROM assets GROUP BY status')) byStatus[x.status] = x.n;
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  const byType = Object.fromEntries(TYPES.map((t) => [t, 0]));
  for (const x of db.all(`SELECT c.type_group, COUNT(*) n FROM assets a JOIN asset_categories c ON c.id = a.category_id
                           WHERE a.status NOT IN ('Retired','Disposed') GROUP BY c.type_group`)) byType[x.type_group] = (byType[x.type_group] || 0) + x.n;

  const byDept = db.all(`SELECT COALESCE(d.name, 'Unassigned') AS name, COUNT(*) n FROM assets a LEFT JOIN departments d ON d.id = a.department_id
                          WHERE a.status NOT IN ('Retired','Disposed') GROUP BY d.name ORDER BY n DESC`);

  const emp = db.get(`SELECT COUNT(*) total,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM asset_assignments aa WHERE aa.employee_id = e.id AND aa.status = 'Active') THEN 1 ELSE 0 END) with_assets
      FROM employees e WHERE e.status IN ('Active','On Leave')`);

  const nets = db.all('SELECT * FROM networks');
  const ipUtil = { used: 0, available: 0, reserved: 0, capacity: 0 };
  for (const n of nets) {
    const u = utilization(n);
    ipUtil.used += u.used; ipUtil.available += u.available; ipUtil.reserved += u.reserved; ipUtil.capacity += u.total;
  }
  const ipCounts = db.get(`SELECT COUNT(*) total, SUM(status IN ('Active','Assigned')) active, SUM(status = 'Conflict') conflicts FROM ip_addresses`);
  const isps = db.all('SELECT id, provider_name, connection_name, role, status, speed, contract_end, status_updated_at, status_source FROM isps ORDER BY role = \'Primary\' DESC, provider_name');

  const warrantySoon = db.all(`SELECT a.id, a.asset_tag, a.name, w.end_date FROM assets a
      JOIN warranty_records w ON w.id = (SELECT id FROM warranty_records WHERE asset_id = a.id ORDER BY is_primary DESC, end_date DESC LIMIT 1)
      WHERE a.status NOT IN ('Retired','Disposed') AND w.end_date >= date('now','localtime') AND w.end_date <= date('now','localtime', ?)
      ORDER BY w.end_date`, `+${warrantyDays} days`).map((x) => ({ ...x, days_left: daysUntil(x.end_date) }));
  const contractSoon = isps.filter((i) => { const d = daysUntil(i.contract_end); return d !== null && d >= 0 && d <= contractDays; })
    .map((i) => ({ ...i, days_left: daysUntil(i.contract_end) }));
  const missingAudit = db.get(`SELECT COUNT(DISTINCT i.asset_id) n FROM audit_items i JOIN inventory_audits au ON au.id = i.audit_id
                                WHERE au.status = 'In Progress' AND i.result = 'Missing'`).n;
  const pendingAudits = db.get("SELECT COUNT(*) n FROM inventory_audits WHERE status = 'In Progress'").n;

  // Value = purchase price. Retired/disposed assets are no longer counted as company assets.
  const v = db.get(`SELECT
      COALESCE(SUM(CASE WHEN status NOT IN ('Retired','Disposed') THEN purchase_cost END), 0) AS total,
      COALESCE(SUM(CASE WHEN status = 'Deployed' THEN purchase_cost END), 0) AS in_use,
      COALESCE(SUM(CASE WHEN status = 'Available' THEN purchase_cost END), 0) AS in_stock,
      COALESCE(SUM(CASE WHEN status IN ('Under Repair','Damaged') THEN purchase_cost END), 0) AS repair,
      COALESCE(SUM(CASE WHEN status = 'Lost' THEN purchase_cost END), 0) AS lost,
      SUM(CASE WHEN status NOT IN ('Retired','Disposed') AND purchase_cost IS NULL THEN 1 ELSE 0 END) AS no_price,
      SUM(CASE WHEN status NOT IN ('Retired','Disposed') THEN 1 ELSE 0 END) AS counted
    FROM assets`);

  res.json({
    assets: { total, ...byStatus },
    value: { total: v.total, in_use: v.in_use, in_stock: v.in_stock, repair: v.repair, lost: v.lost, no_price: v.no_price || 0, counted: v.counted || 0, currency: setting('currency_symbol', '₱') },
    employees: { total: emp.total || 0, with_assets: emp.with_assets || 0, without_assets: (emp.total || 0) - (emp.with_assets || 0) },
    network: {
      total_ips: ipCounts.total || 0, active_ips: ipCounts.active || 0, available_ips: ipUtil.available, capacity: ipUtil.capacity,
      subnets: nets.length,
      devices: db.get('SELECT COUNT(*) n FROM network_devices').n,
      active_isps: isps.filter((i) => i.status === 'Active').length,
      inactive_isps: isps.filter((i) => i.status !== 'Active').length,
      backup_isps: isps.filter((i) => i.role === 'Backup').length,
      contracts_expiring: contractSoon.length,
      wifi: db.get('SELECT COUNT(*) n FROM wifi_networks').n,
    },
    alerts: {
      warranty_expiring: warrantySoon.length,
      contract_expiring: contractSoon.length,
      under_repair: byStatus['Under Repair'],
      missing: byStatus.Lost + missingAudit,
      ip_conflicts: ipCounts.conflicts || 0,
      pending_audits: pendingAudits,
      warranty_days: warrantyDays,
      contract_days: contractDays,
    },
    charts: {
      status: STATUSES.filter((s) => s !== 'Disposed').map((s) => ({ label: s, value: byStatus[s] })),
      types: TYPES.map((t) => ({ label: t, value: byType[t] || 0 })),
      departments: byDept.map((d) => ({ label: d.name, value: d.n })),
      ip: [{ label: 'Used', value: ipUtil.used }, { label: 'Available', value: ipUtil.available }, { label: 'Reserved', value: ipUtil.reserved }],
    },
    isps,
    warranty_soon: warrantySoon.slice(0, 8),
    contract_soon: contractSoon,
    repairs: db.all(`SELECT m.id, m.issue, m.status, m.reported_date, a.id AS asset_id, a.asset_tag, a.name FROM maintenance_records m
                       JOIN assets a ON a.id = m.asset_id WHERE m.status NOT IN ('Completed','Unrepairable') ORDER BY m.reported_date DESC LIMIT 6`),
    recent_activity: can(req.user, 'activity.view')
      ? db.all('SELECT id, user_name, action, entity_type, entity_id, entity_label, created_at FROM activity_logs ORDER BY id DESC LIMIT 12')
      : [],
  });
});

module.exports = r;
