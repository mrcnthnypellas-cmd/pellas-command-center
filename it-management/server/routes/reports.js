// Report engine: every report = { title, columns, rows(params) }. Output as JSON, CSV or PDF.
// Reports are built from explicit column lists, so password fields can never leak into them.
const express = require('express');
const db = require('../db/connection');
const { requirePerm, can } = require('../lib/auth');
const { log } = require('../lib/activity');
const { notFound, setting, daysUntil } = require('../lib/util');
const { ASSET_SELECT, decorateAsset } = require('../lib/queries');
const { renderTablePdf } = require('../lib/pdf');

const r = express.Router();

const ASSET_COLS = [
  { key: 'asset_tag', label: 'Asset Tag' }, { key: 'name', label: 'Asset Name', width: 1.6 }, { key: 'category', label: 'Category' },
  { key: 'brand', label: 'Brand' }, { key: 'model', label: 'Model' }, { key: 'serial_number', label: 'Serial No.' },
  { key: 'employee_name', label: 'Assigned To', width: 1.3 }, { key: 'department', label: 'Department' }, { key: 'location', label: 'Location', width: 1.3 },
  { key: 'ip_address', label: 'IP' }, { key: 'status', label: 'Status' }, { key: 'purchase_date', label: 'Purchased' }, { key: 'purchase_cost', label: 'Price' }, { key: 'warranty_end', label: 'Warranty End' },
];
const assets = (where = '', ...p) => db.all(`${ASSET_SELECT} ${where} ORDER BY a.asset_tag`, ...p).map(decorateAsset);

const REPORTS = {
  inventory: { title: 'Complete Asset Inventory', group: 'Assets', columns: ASSET_COLS, rows: () => assets() },
  value: {
    title: 'Asset Value by Category', group: 'Assets',
    columns: [{ key: 'category', label: 'Category', width: 1.4 }, { key: 'assets', label: 'Assets' }, { key: 'priced', label: 'With price' },
      { key: 'in_use', label: 'In use' }, { key: 'in_stock', label: 'In stock' }, { key: 'total', label: 'Total value', width: 1.3 }],
    rows: () => {
      const rows = db.all(`SELECT c.name AS category, COUNT(*) AS assets, COUNT(a.purchase_cost) AS priced,
          ROUND(COALESCE(SUM(CASE WHEN a.status = 'Deployed' THEN a.purchase_cost END), 0), 2) AS in_use,
          ROUND(COALESCE(SUM(CASE WHEN a.status = 'Available' THEN a.purchase_cost END), 0), 2) AS in_stock,
          ROUND(COALESCE(SUM(a.purchase_cost), 0), 2) AS total
        FROM assets a JOIN asset_categories c ON c.id = a.category_id WHERE a.status NOT IN ('Retired','Disposed')
        GROUP BY c.name ORDER BY total DESC`);
      const sum = (k) => Math.round(rows.reduce((t, r) => t + r[k], 0) * 100) / 100;
      return [...rows, { category: 'TOTAL', assets: sum('assets'), priced: sum('priced'), in_use: sum('in_use'), in_stock: sum('in_stock'), total: sum('total') }];
    },
  },
  'per-employee': {
    title: 'Assets Per Employee', group: 'Assets',
    columns: [{ key: 'employee_code', label: 'Emp. ID' }, { key: 'employee_name', label: 'Employee', width: 1.4 }, { key: 'employee_department', label: 'Department' },
      { key: 'asset_tag', label: 'Asset Tag' }, { key: 'name', label: 'Asset', width: 1.6 }, { key: 'category', label: 'Category' }, { key: 'serial_number', label: 'Serial No.' }, { key: 'assigned_date', label: 'Assigned' }],
    rows: () => db.all(`${ASSET_SELECT} WHERE e.id IS NOT NULL ORDER BY e.full_name, a.asset_tag`),
  },
  'per-department': {
    title: 'Assets Per Department', group: 'Assets',
    columns: [{ key: 'department', label: 'Department' }, { key: 'asset_tag', label: 'Asset Tag' }, { key: 'name', label: 'Asset', width: 1.6 }, { key: 'category', label: 'Category' },
      { key: 'employee_name', label: 'Assigned To' }, { key: 'status', label: 'Status' }],
    rows: () => db.all(`${ASSET_SELECT} WHERE a.status NOT IN ('Retired','Disposed') ORDER BY COALESCE(d.name,'~'), a.asset_tag`).map((x) => ({ ...x, department: x.department || 'Unassigned' })),
  },
  'per-location': {
    title: 'Assets Per Location', group: 'Assets',
    columns: [{ key: 'location', label: 'Location', width: 1.4 }, { key: 'current_location', label: 'Detail' }, { key: 'asset_tag', label: 'Asset Tag' }, { key: 'name', label: 'Asset', width: 1.6 },
      { key: 'category', label: 'Category' }, { key: 'employee_name', label: 'Assigned To' }, { key: 'status', label: 'Status' }],
    rows: () => db.all(`${ASSET_SELECT} WHERE a.status NOT IN ('Retired','Disposed') ORDER BY COALESCE(l.name,'~'), a.asset_tag`).map((x) => ({ ...x, location: x.location || 'Unassigned' })),
  },
  deployed: { title: 'Deployed Assets', group: 'Assets', columns: ASSET_COLS, rows: () => assets("WHERE a.status = 'Deployed'") },
  available: { title: 'Available Assets', group: 'Assets', columns: ASSET_COLS, rows: () => assets("WHERE a.status = 'Available'") },
  repair: { title: 'Assets Under Repair', group: 'Assets', columns: ASSET_COLS, rows: () => assets("WHERE a.status IN ('Under Repair','Damaged')") },
  lost: { title: 'Lost / Missing Assets', group: 'Assets', columns: ASSET_COLS, rows: () => assets("WHERE a.status = 'Lost'") },
  retired: { title: 'Retired / Disposed Assets', group: 'Assets', columns: ASSET_COLS, rows: () => assets("WHERE a.status IN ('Retired','Disposed')") },
  warranty: {
    title: 'Warranty Expiration', group: 'Maintenance',
    columns: [{ key: 'asset_tag', label: 'Asset Tag' }, { key: 'name', label: 'Asset', width: 1.6 }, { key: 'warranty_provider', label: 'Provider' },
      { key: 'warranty_start', label: 'Start' }, { key: 'warranty_end', label: 'Expires' }, { key: 'days_left', label: 'Days Left' }, { key: 'warranty_status', label: 'Status' }],
    rows: () => assets("WHERE a.status NOT IN ('Disposed') AND w.end_date IS NOT NULL").map((a) => ({ ...a, days_left: daysUntil(a.warranty_end) }))
      .sort((a, b) => a.days_left - b.days_left),
  },
  maintenance: {
    title: 'Maintenance History', group: 'Maintenance',
    columns: [{ key: 'asset_tag', label: 'Asset Tag' }, { key: 'asset_name', label: 'Asset', width: 1.3 }, { key: 'issue', label: 'Issue', width: 1.8 }, { key: 'reported_date', label: 'Reported' },
      { key: 'repair_end', label: 'Completed' }, { key: 'technician', label: 'Technician' }, { key: 'vendor', label: 'Vendor' }, { key: 'repair_cost', label: 'Cost' }, { key: 'status', label: 'Status' }],
    rows: () => db.all(`SELECT m.*, a.asset_tag, a.name AS asset_name FROM maintenance_records m JOIN assets a ON a.id = m.asset_id ORDER BY m.reported_date DESC`),
  },
  history: {
    title: 'Asset History', group: 'Assets',
    columns: [{ key: 'event_date', label: 'Date' }, { key: 'asset_tag', label: 'Asset Tag' }, { key: 'asset_name', label: 'Asset', width: 1.3 }, { key: 'event_type', label: 'Event' },
      { key: 'description', label: 'Description', width: 2.6 }, { key: 'user_name', label: 'By' }],
    params: ['asset_id'],
    rows: (p) => db.all(`SELECT h.*, a.asset_tag, a.name AS asset_name, u.full_name AS user_name FROM asset_history h JOIN assets a ON a.id = h.asset_id
                          LEFT JOIN users u ON u.id = h.user_id ${p.asset_id ? 'WHERE h.asset_id = ?' : ''} ORDER BY h.event_date DESC, h.id DESC`, ...(p.asset_id ? [p.asset_id] : [])),
  },
  ips: {
    title: 'IP Address List', group: 'Network',
    columns: [{ key: 'address', label: 'IP Address' }, { key: 'device', label: 'Device', width: 1.4 }, { key: 'asset_tag', label: 'Asset Tag' }, { key: 'employee_name', label: 'Assigned To' },
      { key: 'mac_address', label: 'MAC' }, { key: 'network_name', label: 'Network' }, { key: 'location', label: 'Location' }, { key: 'ip_type', label: 'Type' }, { key: 'status', label: 'Status' }],
    rows: () => db.all(`SELECT ip.*, COALESCE(ip.device_name, a.name) AS device, a.asset_tag, e.full_name AS employee_name, n.name AS network_name,
                          COALESCE(al.name, nl.name) AS location
                         FROM ip_addresses ip JOIN networks n ON n.id = ip.network_id LEFT JOIN assets a ON a.id = ip.asset_id
                         LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.status = 'Active' LEFT JOIN employees e ON e.id = aa.employee_id
                         LEFT JOIN locations al ON al.id = a.location_id LEFT JOIN locations nl ON nl.id = n.location_id
                        ORDER BY n.name, ip.address_num`),
  },
  devices: {
    title: 'Network Device List', group: 'Network',
    columns: [{ key: 'name', label: 'Device', width: 1.3 }, { key: 'device_type', label: 'Type' }, { key: 'asset_tag', label: 'Asset Tag' }, { key: 'model', label: 'Model' },
      { key: 'ip_address', label: 'IP' }, { key: 'mac', label: 'MAC' }, { key: 'network_name', label: 'Network' }, { key: 'isp_name', label: 'ISP' }, { key: 'location', label: 'Location' }, { key: 'status', label: 'Status' }],
    rows: () => db.all(`SELECT nd.*, a.asset_tag, (COALESCE(a.brand,'') || ' ' || COALESCE(a.model,'')) AS model, ip.address AS ip_address, COALESCE(ip.mac_address, a.mac_address) AS mac,
                          n.name AS network_name, isp.provider_name AS isp_name, l.name AS location
                         FROM network_devices nd LEFT JOIN assets a ON a.id = nd.asset_id
                         LEFT JOIN ip_addresses ip ON ip.id = (SELECT id FROM ip_addresses WHERE asset_id = nd.asset_id ORDER BY id LIMIT 1)
                         LEFT JOIN networks n ON n.id = nd.network_id LEFT JOIN isps isp ON isp.id = nd.isp_id LEFT JOIN locations l ON l.id = nd.location_id ORDER BY nd.name`),
  },
  isps: {
    title: 'ISP List', group: 'Network',
    columns: [{ key: 'provider_name', label: 'Provider' }, { key: 'connection_name', label: 'Connection', width: 1.3 }, { key: 'role', label: 'Role' }, { key: 'connection_type', label: 'Type' },
      { key: 'plan', label: 'Plan' }, { key: 'speed', label: 'Speed' }, { key: 'public_ip', label: 'Public IP' }, { key: 'status', label: 'Status' }, { key: 'contract_end', label: 'Contract End' },
      { key: 'monthly_cost', label: 'Monthly Cost' }, { key: 'support_number', label: 'Support No.' }],
    rows: () => db.all("SELECT * FROM isps ORDER BY role = 'Primary' DESC, provider_name"),
  },
  audit: {
    title: 'Inventory Audit Report', group: 'Audit',
    columns: [{ key: 'audit_name', label: 'Audit' }, { key: 'asset_tag', label: 'Asset Tag' }, { key: 'asset_name', label: 'Asset', width: 1.5 }, { key: 'expected_location', label: 'Expected Location' },
      { key: 'expected_employee', label: 'Expected Holder' }, { key: 'result', label: 'Result' }, { key: 'notes', label: 'Notes', width: 1.4 }, { key: 'checked_at', label: 'Checked' }],
    params: ['audit_id'],
    rows: (p) => db.all(`SELECT i.*, au.name AS audit_name, a.asset_tag, a.name AS asset_name FROM audit_items i JOIN inventory_audits au ON au.id = i.audit_id
                          JOIN assets a ON a.id = i.asset_id ${p.audit_id ? 'WHERE i.audit_id = ?' : ''} ORDER BY au.audit_date DESC, a.asset_tag`, ...(p.audit_id ? [p.audit_id] : [])),
  },
};

r.get('/', requirePerm('reports.view'), (_req, res) => {
  res.json(Object.entries(REPORTS).map(([key, d]) => ({ key, title: d.title, group: d.group, params: d.params || [] })));
});

r.get('/:key', requirePerm('reports.view'), (req, res) => {
  const def = REPORTS[req.params.key];
  if (!def) throw notFound('Report');
  const params = Object.fromEntries((def.params || []).filter((k) => req.query[k]).map((k) => [k, req.query[k]]));
  const rows = def.rows(params).map((row) => Object.fromEntries(def.columns.map((c) => [c.key, row[c.key] ?? null])));
  const format = req.query.format || 'json';
  if (format === 'json') return res.json({ key: req.params.key, title: def.title, columns: def.columns, rows });

  if (!can(req.user, 'reports.export')) return res.status(403).json({ error: 'Permission denied (reports.export)' });
  const filename = `${req.params.key}-report-${new Date().toISOString().slice(0, 10)}`;
  log(req, `Report exported (${format.toUpperCase()})`, 'report', null, def.title);
  if (format === 'csv') {
    const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [def.columns.map((c) => esc(c.label)).join(','), ...rows.map((row) => def.columns.map((c) => esc(row[c.key])).join(','))];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(`﻿${lines.join('\r\n')}`); // BOM so Excel opens UTF-8 (₱, ñ) correctly
  }
  if (format === 'pdf') {
    return renderTablePdf(res, { title: def.title, company: setting('company_name', 'Company'), subtitle: def.group, columns: def.columns, rows, filename });
  }
  res.status(400).json({ error: 'Unknown format' });
});

module.exports = r;
