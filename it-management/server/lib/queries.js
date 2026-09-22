// Shared relational queries: an asset with everything it is connected to.
const db = require('../db/connection');
const { warrantyStatus, fileUrl } = require('./util');

const ASSET_SELECT = `
  SELECT a.*, c.name AS category, c.prefix, c.type_group, c.is_network,
         d.name AS department, l.name AS location,
         aa.id AS assignment_id, aa.assigned_date, e.id AS employee_id, e.full_name AS employee_name,
         e.employee_code, ed.name AS employee_department,
         ip.address AS ip_address, ip.id AS ip_id,
         w.start_date AS warranty_start, w.end_date AS warranty_end, w.provider AS warranty_provider
    FROM assets a
    JOIN asset_categories c ON c.id = a.category_id
    LEFT JOIN departments d ON d.id = a.department_id
    LEFT JOIN locations l ON l.id = a.location_id
    LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.status = 'Active'
    LEFT JOIN employees e ON e.id = aa.employee_id
    LEFT JOIN departments ed ON ed.id = e.department_id
    LEFT JOIN ip_addresses ip ON ip.id = (SELECT id FROM ip_addresses WHERE asset_id = a.id ORDER BY id LIMIT 1)
    LEFT JOIN warranty_records w ON w.id = (SELECT id FROM warranty_records WHERE asset_id = a.id ORDER BY is_primary DESC, end_date DESC LIMIT 1)`;

function decorateAsset(a) {
  if (!a) return a;
  a.warranty_status = warrantyStatus(a.warranty_end);
  a.photo_url = fileUrl(a.photo_path);
  return a;
}

function getAsset(idOrTag) {
  const byId = /^\d+$/.test(String(idOrTag));
  return decorateAsset(db.get(`${ASSET_SELECT} WHERE ${byId ? 'a.id' : 'a.asset_tag'} = ?`, byId ? Number(idOrTag) : String(idOrTag)));
}

// Walks device uplinks: device → parent → ... → ISP.
function uplinkChain(deviceId) {
  const chain = [];
  const seen = new Set();
  let cur = deviceId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const d = db.get(`SELECT nd.id, nd.name, nd.device_type, nd.parent_device_id, nd.isp_id, a.asset_tag,
                        (SELECT address FROM ip_addresses WHERE asset_id = nd.asset_id ORDER BY id LIMIT 1) AS ip_address
                       FROM network_devices nd LEFT JOIN assets a ON a.id = nd.asset_id WHERE nd.id = ?`, cur);
    if (!d) break;
    chain.push(d);
    cur = d.parent_device_id;
  }
  return chain;
}

// Employee → Asset → IP → Network → devices → ISP relationship for an asset.
function relationship(asset) {
  const ip = db.get(`SELECT ip.*, n.name AS network_name, n.cidr, n.gateway, n.dns_primary, n.dns_secondary, n.isp_id
                       FROM ip_addresses ip JOIN networks n ON n.id = ip.network_id WHERE ip.asset_id = ? ORDER BY ip.id LIMIT 1`, asset.id);
  const device = db.get('SELECT id FROM network_devices WHERE asset_id = ?', asset.id);
  let chain = [];
  if (device) chain = uplinkChain(device.id).slice(1);
  else if (asset.connected_device_id) chain = uplinkChain(asset.connected_device_id);
  else if (ip && ip.gateway) {
    const gw = db.get(`SELECT nd.id FROM network_devices nd JOIN ip_addresses i ON i.asset_id = nd.asset_id WHERE i.address = ? AND i.network_id = ?`, ip.gateway, ip.network_id);
    if (gw) chain = uplinkChain(gw.id);
  }
  const ispId = (chain.find((c) => c.isp_id) || {}).isp_id || (ip && ip.isp_id);
  const isp = ispId ? db.get('SELECT id, provider_name, connection_name, role, status FROM isps WHERE id = ?', ispId) : null;
  return {
    employee: asset.employee_id ? { id: asset.employee_id, name: asset.employee_name, code: asset.employee_code, department: asset.employee_department } : null,
    asset: { id: asset.id, tag: asset.asset_tag, name: asset.name, category: asset.category },
    location: asset.location,
    ip: ip ? { id: ip.id, address: ip.address, mac: ip.mac_address || asset.mac_address, type: ip.ip_type, status: ip.status } : null,
    network: ip ? { id: ip.network_id, name: ip.network_name, cidr: ip.cidr, gateway: ip.gateway, dns: [ip.dns_primary, ip.dns_secondary].filter(Boolean).join(', ') } : null,
    devices: chain,
    isp,
  };
}

module.exports = { ASSET_SELECT, decorateAsset, getAsset, uplinkChain, relationship };
