// IP Address Management, Networks/Subnets, Network Devices, ISPs and topology.
const express = require('express');
const db = require('../db/connection');
const { requirePerm } = require('../lib/auth');
const { log, history } = require('../lib/activity');
const { bad, notFound, pick, required, insert, update, diff, daysUntil, setting } = require('../lib/util');
const ipu = require('../lib/ip');
const { uplinkChain } = require('../lib/queries');

const r = express.Router();
const view = requirePerm('network.view');
const manage = requirePerm('network.manage');

const IP_TYPES = ['Static', 'DHCP', 'Reserved'];
const IP_STATUSES = ['Available', 'Assigned', 'Active', 'Reserved', 'Offline', 'Conflict', 'Blocked'];
const USED = ['Assigned', 'Active', 'Offline', 'Conflict', 'Blocked'];
const DEVICE_TYPES = ['Router', 'Firewall', 'Switch', 'Managed Switch', 'Access Point', 'Modem/ONT', 'VPN Gateway', 'Wi-Fi Controller', 'Load Balancer'];

// ───────── Utilisation ─────────
function utilization(net) {
  const c = ipu.parseCidr(net.cidr);
  const counts = db.all('SELECT status, ip_type, COUNT(*) n FROM ip_addresses WHERE network_id = ? GROUP BY status, ip_type', net.id);
  let used = 0; let reserved = 0; let conflicts = 0; let active = 0;
  for (const x of counts) {
    if (x.status === 'Reserved' || (x.ip_type === 'Reserved' && x.status === 'Available')) reserved += x.n;
    else if (USED.includes(x.status)) used += x.n;
    if (x.status === 'Conflict') conflicts += x.n;
    if (x.status === 'Active' || x.status === 'Assigned') active += x.n;
  }
  const total = c ? c.usable : 0;
  let dhcpPool = 0;
  const ds = ipu.ipToNum(net.dhcp_start); const de = ipu.ipToNum(net.dhcp_end);
  if (ds !== null && de !== null && de >= ds) dhcpPool = de - ds + 1;
  return { total, used, reserved, active, conflicts, dhcp_pool: dhcpPool, available: Math.max(total - used - reserved, 0), netmask: c ? c.netmask : null };
}

// ───────── Networks ─────────
const NET_FIELDS = ['name', 'cidr', 'vlan_id', 'gateway', 'dns_primary', 'dns_secondary', 'dhcp_start', 'dhcp_end', 'location_id', 'isp_id', 'purpose', 'description'];
const NET_NUM = ['vlan_id', 'location_id', 'isp_id'];

function validateNetwork(d) {
  if (d.cidr) {
    const c = ipu.parseCidr(d.cidr);
    if (!c) throw bad('Network must be in CIDR form, e.g. 192.168.1.0/24 (prefix /8 – /30)');
    d.cidr = c.cidr;
  }
  for (const f of ['gateway', 'dns_primary', 'dns_secondary', 'dhcp_start', 'dhcp_end']) {
    if (d[f] && !ipu.isValidIp(d[f])) throw bad(`${f.replace('_', ' ')} is not a valid IPv4 address`);
  }
}

const NET_SELECT = `SELECT n.*, l.name AS location, i.provider_name AS isp_name, i.role AS isp_role
                      FROM networks n LEFT JOIN locations l ON l.id = n.location_id LEFT JOIN isps i ON i.id = n.isp_id`;

r.get('/networks', view, (_req, res) => {
  res.json(db.all(`${NET_SELECT} ORDER BY n.name`).map((n) => ({ ...n, ...utilization(n) })));
});

r.get('/networks/:id', view, (req, res) => {
  const n = db.get(`${NET_SELECT} WHERE n.id = ?`, req.params.id);
  if (!n) throw notFound('Network');
  res.json({
    ...n, ...utilization(n),
    ips: ipList({ network_id: n.id }),
    devices: db.all(`SELECT nd.id, nd.name, nd.device_type, nd.status, a.asset_tag,
                       (SELECT address FROM ip_addresses WHERE asset_id = nd.asset_id ORDER BY id LIMIT 1) AS ip_address
                       FROM network_devices nd LEFT JOIN assets a ON a.id = nd.asset_id WHERE nd.network_id = ? ORDER BY nd.name`, n.id),
    wifi: db.all('SELECT id, ssid, security, band, is_guest FROM wifi_networks WHERE network_id = ?', n.id),
  });
});

// Next free address outside the DHCP pool (for static assignment).
r.get('/networks/:id/next-ip', view, (req, res) => {
  const n = db.get('SELECT * FROM networks WHERE id = ?', req.params.id);
  if (!n) throw notFound('Network');
  const c = ipu.parseCidr(n.cidr);
  const taken = new Set(db.all('SELECT address_num FROM ip_addresses WHERE network_id = ? AND status != ?', n.id, 'Available').map((x) => x.address_num));
  const gw = ipu.ipToNum(n.gateway);
  if (gw !== null) taken.add(gw);
  const ds = ipu.ipToNum(n.dhcp_start); const de = ipu.ipToNum(n.dhcp_end);
  for (let x = c.firstHost; x <= c.lastHost; x++) {
    if (taken.has(x)) continue;
    if (ds !== null && de !== null && x >= ds && x <= de) continue;
    return res.json({ address: ipu.numToIp(x) });
  }
  res.json({ address: null });
});

r.post('/networks', manage, (req, res) => {
  const d = pick(req.body, NET_FIELDS, NET_NUM);
  required(d, { name: 'Network name', cidr: 'Network (CIDR)' });
  validateNetwork(d);
  if (db.get('SELECT 1 FROM networks WHERE cidr = ?', d.cidr)) throw bad(`${d.cidr} already exists`);
  for (const f of ['gateway', 'dhcp_start', 'dhcp_end']) if (d[f] && !ipu.inCidr(d[f], d.cidr)) throw bad(`${f.replace('_', ' ')} ${d[f]} is outside ${d.cidr}`);
  const id = insert('networks', d);
  log(req, 'Network created', 'network', id, `${d.name} (${d.cidr})`);
  res.status(201).json(db.get(`${NET_SELECT} WHERE n.id = ?`, id));
});

r.put('/networks/:id', manage, (req, res) => {
  const old = db.get('SELECT * FROM networks WHERE id = ?', req.params.id);
  if (!old) throw notFound('Network');
  const d = pick(req.body, NET_FIELDS, NET_NUM);
  validateNetwork(d);
  if (d.cidr && d.cidr !== old.cidr) {
    if (db.get('SELECT 1 FROM networks WHERE cidr = ? AND id != ?', d.cidr, old.id)) throw bad(`${d.cidr} already exists`);
    const outside = db.all('SELECT address FROM ip_addresses WHERE network_id = ?', old.id).filter((x) => !ipu.inCidr(x.address, d.cidr));
    if (outside.length) throw bad(`${outside.length} existing IP(s) would fall outside ${d.cidr}`);
  }
  const changed = diff(old, d);
  update('networks', old.id, d);
  if (changed.length) log(req, 'Network updated', 'network', old.id, d.name || old.name, { fields: changed.join(', ') });
  res.json(db.get(`${NET_SELECT} WHERE n.id = ?`, old.id));
});

r.delete('/networks/:id', manage, (req, res) => {
  const n = db.get('SELECT * FROM networks WHERE id = ?', req.params.id);
  if (!n) throw notFound('Network');
  const ips = db.get('SELECT COUNT(*) n FROM ip_addresses WHERE network_id = ?', n.id).n;
  if (ips) throw bad(`Network still has ${ips} IP record(s). Remove them first.`);
  db.run('DELETE FROM networks WHERE id = ?', n.id);
  log(req, 'Network deleted', 'network', n.id, n.name);
  res.json({ ok: true });
});

// ───────── IP addresses ─────────
const IP_SELECT = `SELECT ip.*, n.name AS network_name, n.cidr, n.gateway, n.dns_primary, n.dns_secondary,
    a.asset_tag, a.name AS asset_name, a.mac_address AS asset_mac,
    COALESCE(ip.device_name, a.name) AS device, e.id AS employee_id, e.full_name AS employee_name,
    COALESCE(ad.name, ed.name) AS department, COALESCE(al.name, nl.name) AS location, isp.provider_name AS isp_name
  FROM ip_addresses ip JOIN networks n ON n.id = ip.network_id
  LEFT JOIN assets a ON a.id = ip.asset_id
  LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.status = 'Active'
  LEFT JOIN employees e ON e.id = aa.employee_id
  LEFT JOIN departments ad ON ad.id = a.department_id LEFT JOIN departments ed ON ed.id = e.department_id
  LEFT JOIN locations al ON al.id = a.location_id LEFT JOIN locations nl ON nl.id = n.location_id
  LEFT JOIN isps isp ON isp.id = n.isp_id`;

function ipList(q) {
  const where = [];
  const p = [];
  if (q.network_id) { where.push('ip.network_id = ?'); p.push(q.network_id); }
  if (q.status) { where.push('ip.status = ?'); p.push(q.status); }
  if (q.ip_type) { where.push('ip.ip_type = ?'); p.push(q.ip_type); }
  if (q.q) { where.push('(ip.address LIKE ? OR ip.mac_address LIKE ? OR ip.hostname LIKE ? OR ip.device_name LIKE ? OR a.asset_tag LIKE ? OR a.name LIKE ? OR e.full_name LIKE ?)'); for (let i = 0; i < 7; i++) p.push(`%${q.q}%`); }
  return db.all(`${IP_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY n.name, ip.address_num`, ...p);
}

r.get('/ips', view, (req, res) => res.json(ipList(req.query)));

function validateIp(d, existingId) {
  const net = db.get('SELECT * FROM networks WHERE id = ?', d.network_id);
  if (!net) throw bad('Network is required');
  if (!ipu.isValidIp(d.address)) throw bad('Invalid IPv4 address');
  if (!ipu.inCidr(d.address, net.cidr)) throw bad(`${d.address} is not a usable host in ${net.name} (${net.cidr})`);
  if (d.ip_type && !IP_TYPES.includes(d.ip_type)) throw bad('Invalid IP type');
  if (d.status && !IP_STATUSES.includes(d.status)) throw bad('Invalid IP status');
  if (d.mac_address) {
    if (!ipu.MAC_RE.test(d.mac_address)) throw bad('MAC address must look like AA:BB:CC:DD:EE:FF');
    d.mac_address = ipu.normalizeMac(d.mac_address);
  }
  const dup = db.get('SELECT id FROM ip_addresses WHERE network_id = ? AND address = ? AND id != ?', net.id, d.address, existingId || 0);
  if (dup) throw bad(`${d.address} already exists in ${net.name}. Edit the existing record instead (possible IP conflict).`);
  if (d.asset_id && !db.get('SELECT 1 FROM assets WHERE id = ?', d.asset_id)) throw bad('Asset not found');
  if (d.mac_address) {
    const macDup = db.get('SELECT address FROM ip_addresses WHERE network_id = ? AND mac_address = ? AND id != ?', net.id, d.mac_address, existingId || 0);
    if (macDup && d.ip_type !== 'DHCP') d.warning = `MAC ${d.mac_address} is also used by ${macDup.address}`;
  }
  d.address_num = ipu.ipToNum(d.address);
  return net;
}

const IP_FIELDS = ['address', 'network_id', 'asset_id', 'device_name', 'hostname', 'mac_address', 'ip_type', 'status', 'notes'];

r.post('/ips', manage, (req, res) => {
  const d = pick(req.body, IP_FIELDS, ['network_id', 'asset_id']);
  required(d, { address: 'IP address', network_id: 'Network' });
  d.ip_type = d.ip_type || 'Static';
  d.status = d.status || (d.asset_id || d.device_name ? 'Assigned' : d.ip_type === 'Reserved' ? 'Reserved' : 'Available');
  const net = validateIp(d);
  const warning = d.warning; delete d.warning;
  const id = db.tx(() => {
    const newId = insert('ip_addresses', d);
    if (d.asset_id) {
      const a = db.get('SELECT asset_tag FROM assets WHERE id = ?', d.asset_id);
      history(req, d.asset_id, 'Network', `IP ${d.address} assigned (${net.name})`);
      log(req, 'IP assigned', 'ip', newId, d.address, { asset: a.asset_tag, network: net.name });
    } else log(req, 'IP created', 'ip', newId, d.address, { network: net.name, status: d.status });
    return newId;
  });
  res.status(201).json({ ...db.get(`${IP_SELECT} WHERE ip.id = ?`, id), warning });
});

r.put('/ips/:id', manage, (req, res) => {
  const old = db.get('SELECT * FROM ip_addresses WHERE id = ?', req.params.id);
  if (!old) throw notFound('IP address');
  const d = pick(req.body, IP_FIELDS, ['network_id', 'asset_id']);
  const merged = { ...old, ...d };
  const net = validateIp(merged, old.id);
  const warning = merged.warning;
  if ('address' in d) d.address_num = merged.address_num;
  if (d.mac_address) d.mac_address = merged.mac_address;
  const changed = diff(old, d);
  db.tx(() => {
    update('ip_addresses', old.id, d);
    if ('asset_id' in d && d.asset_id !== old.asset_id) {
      if (old.asset_id) history(req, old.asset_id, 'Network', `IP ${old.address} released`);
      if (d.asset_id) history(req, d.asset_id, 'Network', `IP ${merged.address} assigned (${net.name})`);
    } else if ('address' in d && d.address !== old.address && merged.asset_id) {
      history(req, merged.asset_id, 'Network', `IP changed from ${old.address} to ${d.address}`);
    }
    if (changed.length) log(req, 'IP changed', 'ip', old.id, merged.address, { fields: changed.join(', ') });
  });
  res.json({ ...db.get(`${IP_SELECT} WHERE ip.id = ?`, old.id), warning });
});

r.delete('/ips/:id', manage, (req, res) => {
  const old = db.get('SELECT * FROM ip_addresses WHERE id = ?', req.params.id);
  if (!old) throw notFound('IP address');
  db.tx(() => {
    db.run('DELETE FROM ip_addresses WHERE id = ?', old.id);
    if (old.asset_id) history(req, old.asset_id, 'Network', `IP ${old.address} released`);
    log(req, 'IP deleted', 'ip', old.id, old.address);
  });
  res.json({ ok: true });
});

// ───────── ISPs ─────────
const ISP_FIELDS = ['provider_name', 'connection_name', 'connection_type', 'plan', 'speed', 'public_ip', 'account_number', 'router_device_id',
  'location_id', 'role', 'status', 'contract_start', 'contract_end', 'monthly_cost', 'support_contact', 'support_number', 'support_email', 'notes', 'monitor_target'];
const ISP_NUM = ['router_device_id', 'location_id', 'monthly_cost'];
const ISP_SELECT = `SELECT i.*, l.name AS location, nd.name AS router_name, a.asset_tag AS router_tag
  FROM isps i LEFT JOIN locations l ON l.id = i.location_id LEFT JOIN network_devices nd ON nd.id = i.router_device_id
  LEFT JOIN assets a ON a.id = nd.asset_id`;
const decorateIsp = (i) => i && { ...i, contract_days_left: daysUntil(i.contract_end) };

r.get('/isps', view, (_req, res) => res.json(db.all(`${ISP_SELECT} ORDER BY i.role = 'Primary' DESC, i.provider_name`).map(decorateIsp)));

r.get('/isps/:id', view, (req, res) => {
  const i = decorateIsp(db.get(`${ISP_SELECT} WHERE i.id = ?`, req.params.id));
  if (!i) throw notFound('ISP');
  i.networks = db.all('SELECT id, name, cidr FROM networks WHERE isp_id = ?', i.id);
  i.devices = db.all('SELECT id, name, device_type, status FROM network_devices WHERE isp_id = ?', i.id);
  i.credentials = db.all('SELECT id, name, credential_type, username FROM credentials WHERE isp_id = ?', i.id);
  res.json(i);
});

function validateIsp(d) {
  if (d.public_ip && !ipu.isValidIp(d.public_ip)) throw bad('Public IP is not a valid IPv4 address');
  if (d.role && !['Primary', 'Backup'].includes(d.role)) throw bad('Role must be Primary or Backup');
  if (d.status && !['Active', 'Inactive', 'Down', 'Suspended'].includes(d.status)) throw bad('Invalid ISP status');
}

r.post('/isps', manage, (req, res) => {
  const d = pick(req.body, ISP_FIELDS, ISP_NUM);
  required(d, { provider_name: 'Provider', connection_name: 'Connection name' });
  validateIsp(d);
  d.status_updated_at = new Date().toISOString();
  const id = insert('isps', d);
  log(req, 'ISP created', 'isp', id, `${d.provider_name} — ${d.connection_name}`);
  res.status(201).json(decorateIsp(db.get(`${ISP_SELECT} WHERE i.id = ?`, id)));
});

r.put('/isps/:id', manage, (req, res) => {
  const old = db.get('SELECT * FROM isps WHERE id = ?', req.params.id);
  if (!old) throw notFound('ISP');
  const d = pick(req.body, ISP_FIELDS, ISP_NUM);
  validateIsp(d);
  if (d.status && d.status !== old.status) { d.status_updated_at = new Date().toISOString(); d.status_source = 'manual'; }
  const changed = diff(old, d);
  update('isps', old.id, d);
  if (changed.length) log(req, 'ISP updated', 'isp', old.id, old.provider_name, { fields: changed.join(', '), ...(d.status && d.status !== old.status ? { status: d.status } : {}) });
  res.json(decorateIsp(db.get(`${ISP_SELECT} WHERE i.id = ?`, old.id)));
});

r.delete('/isps/:id', manage, (req, res) => {
  const i = db.get('SELECT * FROM isps WHERE id = ?', req.params.id);
  if (!i) throw notFound('ISP');
  db.run('DELETE FROM isps WHERE id = ?', i.id);
  log(req, 'ISP deleted', 'isp', i.id, i.provider_name);
  res.json({ ok: true });
});

// ───────── Network devices ─────────
const DEV_FIELDS = ['name', 'device_type', 'asset_id', 'network_id', 'isp_id', 'parent_device_id', 'location_id', 'management_url', 'firmware_version', 'port_count', 'status', 'notes'];
const DEV_NUM = ['asset_id', 'network_id', 'isp_id', 'parent_device_id', 'location_id', 'port_count'];
const DEV_SELECT = `SELECT nd.*, a.asset_tag, a.brand, a.model, a.serial_number, a.mac_address AS asset_mac, a.status AS asset_status,
    ip.address AS ip_address, ip.mac_address AS ip_mac, n.name AS network_name, n.cidr, isp.provider_name AS isp_name,
    l.name AS location, p.name AS parent_name,
    (SELECT COUNT(*) FROM credentials c WHERE c.device_id = nd.id) AS credential_count
  FROM network_devices nd LEFT JOIN assets a ON a.id = nd.asset_id
  LEFT JOIN ip_addresses ip ON ip.id = (SELECT id FROM ip_addresses WHERE asset_id = nd.asset_id ORDER BY id LIMIT 1)
  LEFT JOIN networks n ON n.id = nd.network_id LEFT JOIN isps isp ON isp.id = nd.isp_id
  LEFT JOIN locations l ON l.id = nd.location_id LEFT JOIN network_devices p ON p.id = nd.parent_device_id`;

r.get('/devices', view, (req, res) => {
  const where = [];
  const p = [];
  if (req.query.device_type) { where.push('nd.device_type = ?'); p.push(req.query.device_type); }
  if (req.query.q) { where.push('(nd.name LIKE ? OR a.asset_tag LIKE ? OR ip.address LIKE ? OR a.model LIKE ?)'); for (let i = 0; i < 4; i++) p.push(`%${req.query.q}%`); }
  res.json(db.all(`${DEV_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY nd.name`, ...p));
});

r.get('/devices/:id', view, (req, res) => {
  const d = db.get(`${DEV_SELECT} WHERE nd.id = ?`, req.params.id);
  if (!d) throw notFound('Network device');
  const chain = uplinkChain(d.id);
  const ispId = (chain.find((c) => c.isp_id) || {}).isp_id;
  res.json({
    ...d,
    uplink_chain: chain,
    upstream_isp: ispId ? db.get('SELECT id, provider_name, connection_name, role, status FROM isps WHERE id = ?', ispId) : null,
    children: db.all(`SELECT nd.id, nd.name, nd.device_type, nd.status, a.asset_tag,
                        (SELECT address FROM ip_addresses WHERE asset_id = nd.asset_id ORDER BY id LIMIT 1) AS ip_address
                        FROM network_devices nd LEFT JOIN assets a ON a.id = nd.asset_id WHERE nd.parent_device_id = ?`, d.id),
    clients: db.all(`SELECT a.id, a.asset_tag, a.name, a.status, (SELECT address FROM ip_addresses WHERE asset_id = a.id ORDER BY id LIMIT 1) AS ip_address
                       FROM assets a WHERE a.connected_device_id = ? ORDER BY a.asset_tag`, d.id),
    credentials: db.all('SELECT id, name, credential_type, username, management_url, updated_at, last_accessed_at FROM credentials WHERE device_id = ?', d.id),
    maintenance: d.asset_id ? db.all('SELECT * FROM maintenance_records WHERE asset_id = ? ORDER BY reported_date DESC', d.asset_id) : [],
    history: d.asset_id ? db.all('SELECT h.*, u.full_name AS user_name FROM asset_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.asset_id = ? ORDER BY h.event_date DESC, h.id DESC', d.asset_id) : [],
    wifi: db.all('SELECT id, ssid, security, band FROM wifi_networks WHERE access_point_id = ?', d.id),
  });
});

function validateDevice(d, id) {
  if (d.device_type && !DEVICE_TYPES.includes(d.device_type)) throw bad('Invalid device type');
  if (d.asset_id) {
    const other = db.get('SELECT name FROM network_devices WHERE asset_id = ? AND id != ?', d.asset_id, id || 0);
    if (other) throw bad(`That asset is already linked to device "${other.name}"`);
  }
  if (id && d.parent_device_id) {
    if (d.parent_device_id === Number(id)) throw bad('A device cannot uplink to itself');
    if (uplinkChain(d.parent_device_id).some((c) => c.id === Number(id))) throw bad('That uplink would create a loop');
  }
}

r.post('/devices', manage, (req, res) => {
  const d = pick(req.body, DEV_FIELDS, DEV_NUM);
  required(d, { name: 'Device name', device_type: 'Device type' });
  validateDevice(d);
  const id = insert('network_devices', d);
  if (d.asset_id) history(req, d.asset_id, 'Network', `Registered as network device "${d.name}" (${d.device_type})`);
  log(req, 'Network device created', 'device', id, d.name, { type: d.device_type });
  res.status(201).json(db.get(`${DEV_SELECT} WHERE nd.id = ?`, id));
});

r.put('/devices/:id', manage, (req, res) => {
  const old = db.get('SELECT * FROM network_devices WHERE id = ?', req.params.id);
  if (!old) throw notFound('Network device');
  const d = pick(req.body, DEV_FIELDS, DEV_NUM);
  validateDevice(d, old.id);
  const changed = diff(old, d);
  update('network_devices', old.id, d);
  if (changed.length) {
    log(req, 'Network device updated', 'device', old.id, d.name || old.name, { fields: changed.join(', ') });
    const assetId = d.asset_id ?? old.asset_id;
    if (assetId) history(req, assetId, 'Network', `Device settings updated (${changed.join(', ')})`);
  }
  res.json(db.get(`${DEV_SELECT} WHERE nd.id = ?`, old.id));
});

r.delete('/devices/:id', manage, (req, res) => {
  const d = db.get('SELECT * FROM network_devices WHERE id = ?', req.params.id);
  if (!d) throw notFound('Network device');
  db.run('DELETE FROM network_devices WHERE id = ?', d.id);
  log(req, 'Network device deleted', 'device', d.id, d.name);
  res.json({ ok: true });
});

// ───────── Topology: ISP → router → switch → AP → clients ─────────
r.get('/topology', view, (_req, res) => {
  const devices = db.all(`SELECT nd.id, nd.name, nd.device_type, nd.status, nd.parent_device_id, nd.isp_id, a.asset_tag,
      (SELECT address FROM ip_addresses WHERE asset_id = nd.asset_id ORDER BY id LIMIT 1) AS ip_address
      FROM network_devices nd LEFT JOIN assets a ON a.id = nd.asset_id ORDER BY nd.name`);
  const clients = db.all(`SELECT a.id, a.asset_tag, a.name, a.status, a.connected_device_id,
      (SELECT address FROM ip_addresses WHERE asset_id = a.id ORDER BY id LIMIT 1) AS ip_address
      FROM assets a WHERE a.connected_device_id IS NOT NULL AND a.status NOT IN ('Retired','Disposed') ORDER BY a.asset_tag`);
  const node = (dev) => ({
    ...dev,
    children: devices.filter((c) => c.parent_device_id === dev.id).map(node),
    clients: clients.filter((c) => c.connected_device_id === dev.id),
  });
  const roots = devices.filter((d) => !d.parent_device_id);
  const isps = db.all("SELECT id, provider_name, connection_name, role, status, speed, router_device_id FROM isps ORDER BY role = 'Primary' DESC, provider_name");
  // An edge device belongs under every ISP that names it as its router (dual-WAN) or that it names itself.
  const edgeFor = (i) => devices.filter((d) => d.isp_id === i.id || d.id === i.router_device_id);
  const linked = new Set(isps.flatMap((i) => edgeFor(i).map((d) => d.id)));
  res.json({
    isps: isps.map((i) => ({ ...i, devices: edgeFor(i).map(node) })),
    unlinked: roots.filter((d) => !linked.has(d.id)).map(node),
  });
});

r.get('/meta', view, (_req, res) => res.json({ ip_types: IP_TYPES, ip_statuses: IP_STATUSES, device_types: DEVICE_TYPES, contract_alert_days: Number(setting('contract_alert_days', 60)) }));

module.exports = r;
module.exports.utilization = utilization;
module.exports.USED = USED;
