// Global search across assets, employees, IPs, MACs, devices, ISPs, networks and locations.
// Never touches password columns.
const express = require('express');
const db = require('../db/connection');
const { requireAuth, can } = require('../lib/auth');
const { ASSET_SELECT, decorateAsset } = require('../lib/queries');

const r = express.Router();

r.get('/', requireAuth, (req, res) => {
  const raw = String(req.query.q || '').trim();
  if (raw.length < 2) return res.json({ q: raw, results: {} });
  const q = `%${raw}%`;
  const u = req.user;
  const out = {};

  if (can(u, 'assets.view')) {
    out.assets = db.all(`${ASSET_SELECT} WHERE a.asset_tag LIKE ? OR a.name LIKE ? OR a.serial_number LIKE ? OR a.service_tag LIKE ?
                           OR a.brand LIKE ? OR a.model LIKE ? OR a.mac_address LIKE ? OR l.name LIKE ? OR a.current_location LIKE ?
                           ORDER BY a.asset_tag LIMIT 25`, q, q, q, q, q, q, q, q, q).map(decorateAsset);
  }
  if (can(u, 'employees.view')) {
    out.employees = db.all(`SELECT e.id, e.employee_code, e.full_name, e.position, e.status, d.name AS department, l.name AS location,
                              (SELECT COUNT(*) FROM asset_assignments aa WHERE aa.employee_id = e.id AND aa.status = 'Active') AS asset_count
                              FROM employees e LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN locations l ON l.id = e.location_id
                             WHERE e.full_name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ? OR d.name LIKE ? OR l.name LIKE ? LIMIT 25`, q, q, q, q, q);
  }
  if (can(u, 'network.view')) {
    out.ips = db.all(`SELECT ip.id, ip.address, ip.mac_address, ip.ip_type, ip.status, ip.hostname,
                         COALESCE(ip.device_name, a.name) AS device, a.id AS asset_id, a.asset_tag,
                         e.id AS employee_id, e.full_name AS employee_name, COALESCE(ad.name, ed.name) AS department,
                         COALESCE(al.name, nl.name) AS location, n.id AS network_id, n.name AS network_name, n.cidr,
                         isp.id AS isp_id, isp.provider_name AS isp_name
                        FROM ip_addresses ip JOIN networks n ON n.id = ip.network_id
                        LEFT JOIN assets a ON a.id = ip.asset_id
                        LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.status = 'Active'
                        LEFT JOIN employees e ON e.id = aa.employee_id
                        LEFT JOIN departments ad ON ad.id = a.department_id LEFT JOIN departments ed ON ed.id = e.department_id
                        LEFT JOIN locations al ON al.id = a.location_id LEFT JOIN locations nl ON nl.id = n.location_id
                        LEFT JOIN isps isp ON isp.id = n.isp_id
                       WHERE ip.address LIKE ? OR ip.mac_address LIKE ? OR ip.hostname LIKE ? OR ip.device_name LIKE ?
                       ORDER BY ip.address_num LIMIT 25`, q, q, q, q);
    out.devices = db.all(`SELECT nd.id, nd.name, nd.device_type, nd.status, a.asset_tag, l.name AS location,
                             (SELECT address FROM ip_addresses WHERE asset_id = nd.asset_id ORDER BY id LIMIT 1) AS ip_address
                            FROM network_devices nd LEFT JOIN assets a ON a.id = nd.asset_id LEFT JOIN locations l ON l.id = nd.location_id
                           WHERE nd.name LIKE ? OR nd.device_type LIKE ? OR a.asset_tag LIKE ? OR a.model LIKE ? OR nd.management_url LIKE ? LIMIT 25`, q, q, q, q, q);
    out.networks = db.all(`SELECT n.id, n.name, n.cidr, n.gateway, l.name AS location FROM networks n LEFT JOIN locations l ON l.id = n.location_id
                            WHERE n.name LIKE ? OR n.cidr LIKE ? OR n.gateway LIKE ? OR l.name LIKE ? LIMIT 25`, q, q, q, q);
    out.isps = db.all(`SELECT id, provider_name, connection_name, role, status, public_ip FROM isps
                        WHERE provider_name LIKE ? OR connection_name LIKE ? OR public_ip LIKE ? OR account_number LIKE ? LIMIT 25`, q, q, q, q);
  }
  out.locations = db.all(`SELECT id, name, building, floor, room,
                            (SELECT COUNT(*) FROM assets a WHERE a.location_id = locations.id AND a.status NOT IN ('Retired','Disposed')) AS asset_count
                            FROM locations WHERE name LIKE ? OR building LIKE ? OR floor LIKE ? OR room LIKE ? LIMIT 25`, q, q, q, q);
  for (const k of Object.keys(out)) if (!out[k].length) delete out[k];
  res.json({ q: raw, results: out });
});

module.exports = r;
