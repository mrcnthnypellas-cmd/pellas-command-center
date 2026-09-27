// seedBase(): what every new system needs (roles, permissions, asset categories, departments).
// seed(): the full sample data set for trying the system and for tests. All credentials are FAKE.
const db = require('./connection');
const vault = require('../lib/vault');
const { hashPassword } = require('../lib/passwords');
const { PERMISSIONS, ROLE_DEFAULTS } = require('../lib/permissions');
const ipu = require('../lib/ip');

const ins = (table, data) => {
  const keys = Object.keys(data);
  return Number(db.run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => data[k])).lastInsertRowid);
};

const DEFAULT_SETTINGS = { tag_padding: '4', tag_separator: '-', warranty_alert_days: '60', contract_alert_days: '60', currency_symbol: '₱' };
const DEPARTMENTS = [['IT', 'IT'], ['HR', 'HR'], ['Accounting', 'ACC'], ['Operations', 'OPS'], ['Management', 'MGT'], ['Other', 'OTH']];
const CATEGORIES = [
  ['Laptop', 'LAP', 'Laptop', 0], ['Desktop', 'DESK', 'Desktop', 0], ['Monitor', 'MON', 'Monitor', 0], ['Printer', 'PRN', 'Printer', 0],
  ['Router', 'NET', 'Network Device', 1], ['Switch', 'SW', 'Network Device', 1], ['Access Point', 'AP', 'Network Device', 1],
  ['Firewall', 'FW', 'Network Device', 1], ['Mobile Phone', 'MOB', 'Mobile', 0], ['Tablet', 'TAB', 'Mobile', 0],
  ['Server', 'SRV', 'Server', 0], ['UPS', 'UPS', 'Other', 0], ['Keyboard', 'KEY', 'Accessories', 0], ['Headset', 'HDS', 'Accessories', 0],
];

// Roles, permissions, settings, departments and asset categories. Call inside a transaction.
function seedBase(settings = {}) {
  for (const [k, v] of Object.entries({ ...DEFAULT_SETTINGS, ...settings })) ins('settings', { key: k, value: v });
  for (const [key, module, description] of PERMISSIONS) ins('permissions', { key, module, description });
  const roles = {};
  for (const [name, description] of [['Admin', 'Full access to everything'], ['IT Staff', 'Asset and network management'], ['Viewer', 'Read-only access, no passwords']]) {
    roles[name] = ins('roles', { name, description });
    for (const k of ROLE_DEFAULTS[name]) ins('role_permissions', { role_id: roles[name], permission_key: k });
  }
  const dept = {};
  for (const [name, code] of DEPARTMENTS) dept[name] = ins('departments', { name, code });
  const cat = {};
  for (const [name, prefix, type_group, is_network] of CATEGORIES) cat[name] = ins('asset_categories', { name, prefix, type_group, is_network });
  return { roles, dept, cat };
}

function seed() {
  db.open();
  const iso = (d) => d.toISOString().slice(0, 10);
  const rel = (days) => iso(new Date(Date.now() + days * 86400e3));
  const TODAY = rel(0);
  let minute = 0;
  const stamp = (date) => { minute = (minute + 7) % 50; return `${date} 0${1 + (minute % 8)}:${String(minute + 5).padStart(2, '0')}:00`; };

  db.tx(() => {
    // ── Settings, security, departments, categories ──
    const { roles, dept, cat } = seedBase({
      company_name: 'Pellas Corporation', company_address: '2F Pellas Building, 123 Sample Avenue, Makati City, Metro Manila',
      company_phone: '+63 2 8123 4567', company_email: 'it@pellas.example', company_website: 'https://pellas.example',
    });
    const users = {};
    for (const [username, full_name, pw, role, email] of [
      ['admin', 'IT Admin', 'admin123', 'Admin', 'admin@pellas.example'],
      ['itstaff', 'Carlo Mendoza', 'itstaff123', 'IT Staff', 'carlo.mendoza@pellas.example'],
      ['jtech', 'Jose Tan', 'jtech123', 'IT Staff', 'jose.tan@pellas.example'],
      ['viewer', 'Liza Bautista', 'viewer123', 'Viewer', 'liza.bautista@pellas.example'],
    ]) users[username] = ins('users', { username, full_name, password_hash: hashPassword(pw), role_id: roles[role], email });
    // jtech: IT staff who may NOT reveal/copy passwords globally (per-credential grant added below).
    ins('user_permissions', { user_id: users.jtech, permission_key: 'credentials.reveal', granted: 0 });
    ins('user_permissions', { user_id: users.jtech, permission_key: 'credentials.copy', granted: 0 });
    ins('user_permissions', { user_id: users.jtech, permission_key: 'credentials.create', granted: 0 });
    ins('user_permissions', { user_id: users.jtech, permission_key: 'credentials.edit', granted: 0 });

    const ADMIN = users.admin;
    const activity = (date, action, type, id, label, details, user = ADMIN) => ins('activity_logs', {
      user_id: user, user_name: db.get('SELECT full_name FROM users WHERE id = ?', user).full_name, action, entity_type: type,
      entity_id: id, entity_label: label, details: details ? JSON.stringify(details) : null, created_at: stamp(date),
    });

    // ── Organisation ──
    const loc = {};
    for (const [key, name, building, floor, room] of [
      ['GF', 'Main Office - Ground Floor', 'Main Office', 'Ground Floor', 'Reception'],
      ['2F', 'Main Office - 2nd Floor', 'Main Office', '2nd Floor', 'Open Office'],
      ['3F', 'Main Office - 3rd Floor', 'Main Office', '3rd Floor', 'Executive Offices'],
      ['SR', 'Server Room', 'Main Office', '2nd Floor', 'Room 204'],
      ['WH', 'Warehouse', 'Warehouse Annex', 'Ground Floor', 'Storage'],
      ['IT', 'IT Stock Room', 'Main Office', '2nd Floor', 'Room 205'],
    ]) loc[key] = ins('locations', { name, building, floor, room });


    const emp = {};
    for (const [code, full_name, position, d, l, email, phone, status] of [
      ['EMP-001', 'Juan Dela Cruz', 'Operations Supervisor', 'Operations', '2F', 'juan.delacruz@pellas.example', '0917 555 0101', 'Active'],
      ['EMP-002', 'Maria Santos', 'HR Manager', 'HR', '2F', 'maria.santos@pellas.example', '0917 555 0102', 'Active'],
      ['EMP-003', 'Pedro Reyes', 'Senior Accountant', 'Accounting', '2F', 'pedro.reyes@pellas.example', '0917 555 0103', 'Active'],
      ['EMP-004', 'Anna Garcia', 'IT Specialist', 'IT', 'SR', 'anna.garcia@pellas.example', '0917 555 0104', 'Active'],
      ['EMP-005', 'Mark Villanueva', 'General Manager', 'Management', '3F', 'mark.villanueva@pellas.example', '0917 555 0105', 'Active'],
      ['EMP-006', 'Pedro Santos', 'Operations Staff', 'Operations', '2F', 'pedro.santos@pellas.example', '0917 555 0106', 'Active'],
      ['EMP-007', 'Rosa Mercado', 'Admin Assistant', 'Other', 'GF', 'rosa.mercado@pellas.example', '0917 555 0107', 'Active'],
    ]) {
      emp[code] = ins('employees', { employee_code: code, full_name, position, department_id: dept[d], location_id: loc[l], email, contact_number: phone, status });
      activity('2026-01-02', 'Employee created', 'employee', emp[code], full_name, { code });
    }

    // ── Asset helpers (write rows + timeline + activity with realistic dates) ──
    const asset = {};
    const hist = (tag, type, desc, date) => ins('asset_history', { asset_id: asset[tag], event_type: type, description: desc, event_date: date, user_id: ADMIN, created_at: stamp(date) });
    const addAsset = (tag, name, category, o) => {
      asset[tag] = ins('assets', {
        asset_tag: tag, name, category_id: cat[category], brand: o.brand, model: o.model, serial_number: o.serial, service_tag: o.service_tag || null,
        description: o.description || null, supplier: o.supplier, purchase_date: o.purchased, purchase_cost: o.cost, po_number: o.po, invoice_number: o.invoice,
        department_id: o.dept ? dept[o.dept] : null, location_id: loc[o.loc || 'IT'], current_location: o.detail || null, mac_address: o.mac || null,
        status: 'Available', notes: o.notes || null, created_by: ADMIN, created_at: stamp(o.purchased),
      });
      if (o.warranty) ins('warranty_records', { asset_id: asset[tag], provider: o.brand, warranty_type: 'Manufacturer', start_date: o.purchased, end_date: o.warranty, is_primary: 1 });
      hist(tag, 'Purchased', `Purchased from ${o.supplier}`, o.purchased);
      hist(tag, 'Created', `Added to inventory as ${tag} (Available)`, o.purchased);
      activity(o.purchased, 'Asset created', 'asset', asset[tag], tag, { name });
    };
    const setStatus = (tag, status) => db.run('UPDATE assets SET status = ? WHERE id = ?', status, asset[tag]);
    const active = (tag) => db.get("SELECT * FROM asset_assignments WHERE asset_id = ? AND status = 'Active'", asset[tag]);
    const empName = (code) => db.get('SELECT full_name FROM employees WHERE id = ?', emp[code]).full_name;
    const assign = (tag, code, date, o = {}) => {
      const e = db.get('SELECT * FROM employees WHERE id = ?', emp[code]);
      ins('asset_assignments', { asset_id: asset[tag], employee_id: e.id, department_id: e.department_id, location_id: o.loc ? loc[o.loc] : e.location_id,
        assigned_date: date, condition_on_assign: o.condition || 'Good', issued_by: 'IT Admin', notes: o.notes || null, status: 'Active', created_by: ADMIN });
      db.run('UPDATE assets SET status = ?, department_id = ?, location_id = ? WHERE id = ?', 'Deployed', e.department_id, o.loc ? loc[o.loc] : e.location_id, asset[tag]);
      hist(tag, 'Assigned', `Assigned to ${e.full_name} (${code}) — condition: ${o.condition || 'Good'}`, date);
      activity(date, 'Asset assigned', 'asset', asset[tag], tag, { to: e.full_name });
    };
    const transfer = (tag, toCode, date, reason, approved) => {
      const cur = active(tag);
      const from = db.get('SELECT full_name FROM employees WHERE id = ?', cur.employee_id).full_name;
      const to = db.get('SELECT * FROM employees WHERE id = ?', emp[toCode]);
      db.run("UPDATE asset_assignments SET status = 'Transferred', ended_date = ? WHERE id = ?", date, cur.id);
      const nid = ins('asset_assignments', { asset_id: asset[tag], employee_id: to.id, department_id: to.department_id, location_id: to.location_id, assigned_date: date,
        issued_by: approved, notes: `Transferred from ${from} — ${reason}`, status: 'Active', created_by: ADMIN });
      ins('asset_transfers', { asset_id: asset[tag], from_employee_id: cur.employee_id, to_employee_id: to.id, from_assignment_id: cur.id, to_assignment_id: nid,
        transfer_date: date, reason, approved_by: approved, created_by: ADMIN });
      db.run('UPDATE assets SET department_id = ?, location_id = ? WHERE id = ?', to.department_id, to.location_id, asset[tag]);
      hist(tag, 'Transferred', `Transferred from ${from} to ${to.full_name} — ${reason}`, date);
      activity(date, 'Asset transferred', 'asset', asset[tag], tag, { from, to: to.full_name });
    };
    const giveBack = (tag, date, condition, status) => {
      const cur = active(tag);
      const who = db.get('SELECT full_name FROM employees WHERE id = ?', cur.employee_id).full_name;
      db.run("UPDATE asset_assignments SET status = 'Returned', ended_date = ? WHERE id = ?", date, cur.id);
      ins('asset_returns', { assignment_id: cur.id, asset_id: asset[tag], employee_id: cur.employee_id, return_date: date, condition_on_return: condition,
        received_by: 'IT Admin', resulting_status: status, created_by: ADMIN });
      setStatus(tag, status);
      hist(tag, 'Returned', `Returned by ${who} — condition: ${condition} → ${status}`, date);
      activity(date, 'Asset returned', 'asset', asset[tag], tag, { from: who, status });
    };
    const repair = (tag, issue, o) => {
      ins('maintenance_records', { asset_id: asset[tag], issue, reported_date: o.reported, repair_start: o.start || null, repair_end: o.end || null,
        technician: o.tech, vendor: o.vendor || null, repair_cost: o.cost || null, parts_replaced: o.parts || null, status: o.status, notes: o.notes || null, created_by: ADMIN });
      hist(tag, 'Maintenance', `Issue reported: ${issue}`, o.reported);
      hist(tag, 'Maintenance', `Sent for repair — ${issue}`, o.start || o.reported);
      activity(o.reported, 'Maintenance logged', 'asset', asset[tag], tag, { issue, status: 'Reported' });
      if (o.status === 'Completed') {
        hist(tag, 'Repair Completed', `Repair completed${o.parts ? ` — replaced ${o.parts}` : ''}`, o.end);
        activity(o.end, 'Maintenance completed', 'asset', asset[tag], tag, { status: 'Completed' });
      } else setStatus(tag, 'Under Repair');
    };

    // ── Assets ──
    const dellSupplier = 'Dell Technologies PH';
    addAsset('LAP-0001', 'Dell Latitude 5440', 'Laptop', { brand: 'Dell', model: 'Latitude 5440', serial: 'ABC123456', service_tag: '7XK2L93', supplier: dellSupplier, purchased: '2026-01-05', cost: 68500, po: 'PO-2026-0001', invoice: 'INV-DL-88121', warranty: '2029-01-05', mac: '8C:04:BA:11:22:01', description: 'Intel Core i5-1345U, 16GB RAM, 512GB SSD, 14" FHD' });
    addAsset('LAP-0002', 'HP ProBook 450 G10', 'Laptop', { brand: 'HP', model: 'ProBook 450 G10', serial: '5CD3481XYZ', supplier: 'Octagon Computer Superstore', purchased: '2023-10-18', cost: 52900, po: 'PO-2023-0142', invoice: 'OCT-55012', warranty: rel(25), mac: '8C:04:BA:11:22:02', description: 'Intel Core i5-1335U, 16GB RAM, 512GB SSD' });
    addAsset('LAP-0003', 'Lenovo ThinkPad T14 Gen 4', 'Laptop', { brand: 'Lenovo', model: 'ThinkPad T14 Gen 4', serial: 'PF4K8R2M', supplier: 'Lenovo PH Business', purchased: '2026-01-05', cost: 74800, po: 'PO-2026-0001', invoice: 'LNV-20931', warranty: '2029-01-05', mac: '8C:04:BA:11:22:03', description: 'AMD Ryzen 7 PRO 7840U, 32GB RAM, 1TB SSD' });
    addAsset('LAP-0004', 'Dell Latitude 5440', 'Laptop', { brand: 'Dell', model: 'Latitude 5440', serial: 'ABC123789', supplier: dellSupplier, purchased: '2026-01-05', cost: 68500, po: 'PO-2026-0001', invoice: 'INV-DL-88121', warranty: '2029-01-05', loc: 'IT', detail: 'Spare pool — Shelf B', description: 'Spare laptop' });
    addAsset('LAP-0005', 'HP ProBook 440 G9', 'Laptop', { brand: 'HP', model: 'ProBook 440 G9', serial: '5CD2231ABC', supplier: 'Octagon Computer Superstore', purchased: '2022-08-10', cost: 49500, po: 'PO-2022-0098', invoice: 'OCT-41022', warranty: '2025-08-10' });
    addAsset('DESK-0001', 'HP ProDesk 400 G9 SFF', 'Desktop', { brand: 'HP', model: 'ProDesk 400 G9', serial: '4CE3120QWE', supplier: 'Octagon Computer Superstore', purchased: '2025-03-14', cost: 42000, po: 'PO-2025-0031', invoice: 'OCT-50213', warranty: '2028-03-14', mac: '8C:04:BA:11:23:01' });
    addAsset('MON-0001', 'Dell 24" Monitor P2423H', 'Monitor', { brand: 'Dell', model: 'P2423H', serial: 'CN0M9P1X', supplier: dellSupplier, purchased: '2026-01-05', cost: 11900, po: 'PO-2026-0001', invoice: 'INV-DL-88121', warranty: '2029-01-05' });
    addAsset('MON-0002', 'Dell 24" Monitor P2423H', 'Monitor', { brand: 'Dell', model: 'P2423H', serial: 'CN0M9P2Y', supplier: dellSupplier, purchased: '2025-03-14', cost: 11900, po: 'PO-2025-0031', invoice: 'INV-DL-80011', warranty: rel(48) });
    addAsset('MON-0003', 'Dell 27" Monitor P2723D', 'Monitor', { brand: 'Dell', model: 'P2723D', serial: 'CN0K7Q3Z', supplier: dellSupplier, purchased: '2025-06-02', cost: 17500, po: 'PO-2025-0060', invoice: 'INV-DL-82231', warranty: '2028-06-02', loc: 'IT', detail: 'Shelf A' });
    addAsset('KEY-0001', 'Logitech MK295 Keyboard & Mouse', 'Keyboard', { brand: 'Logitech', model: 'MK295', serial: '2219LZ0A1', supplier: 'PC Express', purchased: '2026-01-05', cost: 1450, po: 'PO-2026-0002', invoice: 'PCX-10021' });
    addAsset('HDS-0001', 'Jabra Evolve2 30 Headset', 'Headset', { brand: 'Jabra', model: 'Evolve2 30', serial: 'JB3021K88', supplier: 'PC Express', purchased: '2025-02-01', cost: 4200, po: 'PO-2025-0012', invoice: 'PCX-09012', loc: 'GF' });
    addAsset('MOB-0001', 'Samsung Galaxy A55 5G', 'Mobile Phone', { brand: 'Samsung', model: 'Galaxy A55 5G', serial: 'R58W30ABCD', supplier: 'Samsung Business PH', purchased: '2026-01-06', cost: 24990, po: 'PO-2026-0003', invoice: 'SMS-77120', warranty: '2027-01-06', mac: '5C:E9:1E:44:55:01' });
    addAsset('TAB-0001', 'Samsung Galaxy Tab S9 FE', 'Tablet', { brand: 'Samsung', model: 'Galaxy Tab S9 FE', serial: 'R52WA0TAB1', supplier: 'Samsung Business PH', purchased: '2025-07-20', cost: 26990, po: 'PO-2025-0071', invoice: 'SMS-70011', warranty: rel(18) });
    addAsset('PRN-0001', 'HP LaserJet Pro M404dn', 'Printer', { brand: 'HP', model: 'LaserJet Pro M404dn', serial: 'PHBBK12345', supplier: 'Octagon Computer Superstore', purchased: '2024-05-10', cost: 18900, po: 'PO-2024-0055', invoice: 'OCT-46001', warranty: '2027-05-10', mac: '3C:52:82:77:01:01', loc: '2F', detail: 'Printing area near HR' });
    addAsset('PRN-0002', 'HP LaserJet Pro MFP M428fdw', 'Printer', { brand: 'HP', model: 'LaserJet Pro MFP M428fdw', serial: 'PHBBK67890', supplier: 'Octagon Computer Superstore', purchased: '2023-04-03', cost: 27500, po: 'PO-2023-0040', invoice: 'OCT-38010', warranty: '2025-04-03', mac: '3C:52:82:77:01:02', loc: 'GF', detail: 'Reception' });
    addAsset('UPS-0001', 'APC Back-UPS Pro 1500VA', 'UPS', { brand: 'APC', model: 'BR1500MS', serial: '3B2215X01234', supplier: 'Power Solutions Inc.', purchased: '2025-01-20', cost: 16800, po: 'PO-2025-0005', invoice: 'PSI-2201', warranty: '2027-01-20', loc: 'SR', detail: 'Rack A — bottom' });
    addAsset('SRV-0001', 'Dell PowerEdge T150', 'Server', { brand: 'Dell', model: 'PowerEdge T150', serial: 'SRV7T150X1', service_tag: '9PX4T21', supplier: dellSupplier, purchased: '2025-01-20', cost: 128000, po: 'PO-2025-0004', invoice: 'INV-DL-79001', warranty: '2028-01-20', mac: 'B0:7B:25:99:10:10', loc: 'SR', detail: 'Rack A — U10', description: 'File server & domain controller' });
    addAsset('NET-0001', 'MikroTik RB4011 Router', 'Router', { brand: 'MikroTik', model: 'RB4011iGS+RM', serial: 'HEX4011A77', supplier: 'Network Hub PH', purchased: '2025-01-15', cost: 14500, po: 'PO-2025-0003', invoice: 'NHP-1103', warranty: '2027-01-15', mac: '48:8F:5A:00:00:01', loc: 'SR', detail: 'Rack A — U1' });
    addAsset('SW-0001', 'Cisco CBS350-24T Switch', 'Switch', { brand: 'Cisco', model: 'CBS350-24T-4G', serial: 'FOC2544X0AB', supplier: 'Network Hub PH', purchased: '2025-01-15', cost: 21900, po: 'PO-2025-0003', invoice: 'NHP-1103', warranty: '2030-01-15', mac: '70:18:A7:00:00:02', loc: 'SR', detail: 'Rack A — U2' });
    addAsset('AP-0001', 'TP-Link EAP245 Access Point', 'Access Point', { brand: 'TP-Link', model: 'EAP245 v3', serial: 'TPL245A0001', supplier: 'Network Hub PH', purchased: '2025-01-15', cost: 5600, po: 'PO-2025-0003', invoice: 'NHP-1103', warranty: rel(40), mac: '50:D4:F7:00:00:03', loc: '2F', detail: 'Ceiling — center' });
    addAsset('AP-0002', 'TP-Link EAP225 Access Point', 'Access Point', { brand: 'TP-Link', model: 'EAP225 v4', serial: 'TPL225A0002', supplier: 'Network Hub PH', purchased: '2025-01-15', cost: 3900, po: 'PO-2025-0003', invoice: 'NHP-1103', warranty: '2028-01-15', mac: '50:D4:F7:00:00:04', loc: '3F', detail: 'Ceiling — hallway' });
    addAsset('FW-0001', 'Fortinet FortiGate 40F Firewall', 'Firewall', { brand: 'Fortinet', model: 'FortiGate 40F', serial: 'FGT40FTK2100', supplier: 'SecureNet Distributors', purchased: '2025-01-15', cost: 38500, po: 'PO-2025-0006', invoice: 'SND-4410', warranty: '2028-01-15', mac: '04:D5:90:00:00:05', loc: 'SR', detail: 'Rack A — U3' });

    // ── Assignment stories ──
    assign('LAP-0001', 'EMP-001', '2026-01-10');
    assign('MON-0001', 'EMP-001', '2026-01-10');
    assign('KEY-0001', 'EMP-001', '2026-01-10');
    assign('MOB-0001', 'EMP-001', '2026-01-12');
    assign('LAP-0002', 'EMP-003', '2023-10-20');
    assign('MON-0002', 'EMP-003', '2025-03-15');
    assign('DESK-0001', 'EMP-004', '2025-03-15');
    assign('TAB-0001', 'EMP-005', '2025-07-21');
    assign('PRN-0001', 'EMP-002', '2024-05-12', { loc: '2F', notes: 'Custodian of shared 2F printer' });
    for (const t of ['SRV-0001', 'UPS-0001', 'NET-0001', 'SW-0001', 'FW-0001']) assign(t, 'EMP-004', '2025-01-22', { loc: 'SR', notes: 'Infrastructure custodian' });
    assign('AP-0001', 'EMP-004', '2025-01-22', { loc: '2F', notes: 'Infrastructure custodian' });
    assign('AP-0002', 'EMP-004', '2025-01-22', { loc: '3F', notes: 'Infrastructure custodian' });

    // LAP-0003: the full lifecycle example.
    assign('LAP-0003', 'EMP-001', '2026-01-10', { notes: 'Temporary second unit for field reports' });
    transfer('LAP-0003', 'EMP-006', '2026-03-15', 'Juan received LAP-0001; unit reassigned to new operations staff', 'Mark Villanueva');
    giveBack('LAP-0003', '2026-06-02', 'Keyboard keys unresponsive', 'Available');
    repair('LAP-0003', 'Several keyboard keys unresponsive', { reported: '2026-06-03', start: '2026-06-03', end: '2026-06-10', status: 'Completed', tech: 'Anna Garcia', vendor: 'Lenovo Service Center Makati', cost: 0, parts: 'Keyboard assembly (warranty)' });
    assign('LAP-0003', 'EMP-002', '2026-06-11');

    // HDS-0001 was issued to Rosa, returned, then went missing in the Q2 audit.
    assign('HDS-0001', 'EMP-007', '2025-02-03');
    giveBack('HDS-0001', '2026-04-30', 'Good', 'Available');

    // Maintenance
    repair('PRN-0002', 'Frequent paper jams, fuser error 50.2', { reported: '2026-08-18', start: '2026-08-19', end: '2026-08-26', status: 'Completed', tech: 'HP Authorized Service', vendor: 'Octagon Service Center', cost: 2500, parts: 'Fuser unit, pickup roller' });
    repair('LAP-0005', 'Battery not charging, swollen battery', { reported: rel(-6), start: rel(-5), status: 'Waiting for Parts', tech: 'Anna Garcia', vendor: 'HP Service Center Ortigas', cost: 3800, notes: 'Replacement battery ordered' });

    // ── ISPs ──
    const isp = {};
    isp.converge = ins('isps', { provider_name: 'Converge', connection_name: 'Main Office Internet', connection_type: 'Fiber', plan: 'FlexiBIZ Business Fiber', speed: '500 Mbps',
      public_ip: '203.0.113.10', account_number: 'CNV-00012345', location_id: loc.SR, role: 'Primary', status: 'Active', contract_start: '2026-01-01', contract_end: '2027-01-01',
      monthly_cost: 5999, support_contact: 'Converge Business Hotline', support_number: '(02) 8667 0888', support_email: 'business@converge.example', notes: 'Primary Internet', status_updated_at: new Date().toISOString() });
    isp.pldt = ins('isps', { provider_name: 'PLDT', connection_name: 'Backup Internet', connection_type: 'Fiber', plan: 'PLDT Beyond Fiber', speed: '200 Mbps',
      public_ip: '198.51.100.24', account_number: 'PLDT-0098765', location_id: loc.SR, role: 'Backup', status: 'Active', contract_start: '2024-11-06', contract_end: rel(45),
      monthly_cost: 3499, support_contact: 'PLDT Enterprise', support_number: '171', notes: 'Failover link on router ether2', status_updated_at: new Date().toISOString() });
    isp.globe = ins('isps', { provider_name: 'Globe Business', connection_name: 'LTE Emergency Backup', connection_type: 'LTE', plan: 'Globe Business LTE', speed: '50 Mbps',
      account_number: 'GLB-5566778', location_id: loc.SR, role: 'Backup', status: 'Inactive', contract_start: '2025-06-01', contract_end: '2027-06-01',
      monthly_cost: 1299, support_contact: 'Globe Business Care', support_number: '(02) 7730 1288', notes: 'SIM kept in IT stock room; activate only during outages', status_updated_at: new Date().toISOString() });
    activity('2026-01-01', 'ISP created', 'isp', isp.converge, 'Converge — Main Office Internet');
    activity('2026-01-01', 'ISP created', 'isp', isp.pldt, 'PLDT — Backup Internet');

    // ── Phone directory (sample contacts; 555 numbers are fictional) ──
    for (const [name, organization, department, position, phone, mobile, local_ext, email, category, notes, fav] of [
      ['IT Help Desk', 'Pellas Corporation', 'IT', null, null, '0917 555 0104', '104', 'it@pellas.example', 'Internal', 'First line for all IT issues', 1],
      ['Reception / Front Desk', 'Pellas Corporation', 'Admin', null, '(02) 8123 4567', null, '100', null, 'Internal', null, 0],
      ['Building Admin Office', 'Pellas Building', 'Property Management', 'Building Administrator', '(02) 8555 0140', '0918 555 0140', null, 'admin@pellasbldg.example', 'Other', 'Aircon, power interruptions, access cards', 0],
      ['Converge Business Hotline', 'Converge', 'Business Support', null, '(02) 8667 0888', null, null, 'business@converge.example', 'ISP / Telco', 'Account CNV-00012345 — primary internet', 1],
      ['PLDT Enterprise', 'PLDT', 'Enterprise Support', null, '171', null, null, null, 'ISP / Telco', 'Backup internet', 0],
      ['Globe Business Care', 'Globe Business', 'Customer Care', null, '(02) 7730 1288', null, null, null, 'ISP / Telco', 'LTE backup SIM', 0],
      ['Ramon Cruz', 'Dell Technologies PH', 'Sales', 'Account Manager', '(02) 8555 0161', '0917 555 0161', null, 'ramon.cruz@dell.example', 'Vendor / Supplier', 'Laptops, monitors, servers', 0],
      ['Octagon Service Center', 'Octagon Computer Superstore', 'Service', null, '(02) 8555 0172', null, null, 'service@octagon.example', 'Vendor / Supplier', 'HP printer & laptop repairs', 0],
      ['Network Hub PH', 'Network Hub PH', 'Technical Support', null, null, '0922 555 0183', null, 'support@networkhub.example', 'Vendor / Supplier', 'MikroTik, Cisco, TP-Link', 0],
      ['National Emergency Hotline', null, null, null, '911', null, null, null, 'Emergency', null, 1],
      ['Philippine Red Cross', null, null, null, '143', null, null, null, 'Emergency', null, 0],
      ['Building Security Guard', 'Pellas Building', 'Security', null, null, '0919 555 0199', '199', null, 'Emergency', '24/7 lobby guard', 0],
    ]) ins('phone_contacts', { name, organization, department, position, phone, mobile, local_ext, email, category, notes, is_favorite: fav, created_by: ADMIN });

    // ── Networks ──
    const net = {};
    net.lan = ins('networks', { name: 'Main Office LAN', cidr: '192.168.1.0/24', vlan_id: 1, gateway: '192.168.1.1', dns_primary: '192.168.1.1', dns_secondary: '1.1.1.1', dhcp_start: '192.168.1.100', dhcp_end: '192.168.1.200', location_id: loc['2F'], isp_id: isp.converge, purpose: 'LAN', description: 'Staff workstations, printers and Wi-Fi' });
    net.srv = ins('networks', { name: 'Server Network', cidr: '192.168.10.0/24', vlan_id: 10, gateway: '192.168.10.1', dns_primary: '192.168.10.10', dns_secondary: '192.168.10.1', location_id: loc.SR, isp_id: isp.converge, purpose: 'Servers', description: 'Servers and storage behind the firewall' });
    net.guest = ins('networks', { name: 'Guest Network', cidr: '192.168.20.0/24', vlan_id: 20, gateway: '192.168.20.1', dns_primary: '1.1.1.1', dns_secondary: '8.8.8.8', dhcp_start: '192.168.20.50', dhcp_end: '192.168.20.250', location_id: loc.GF, isp_id: isp.pldt, purpose: 'Guest', description: 'Isolated guest Wi-Fi, internet only' });
    for (const [k, n] of Object.entries(net)) activity('2025-01-22', 'Network created', 'network', n, { lan: 'Main Office LAN', srv: 'Server Network', guest: 'Guest Network' }[k]);

    // ── Network devices (topology: ISP → router → switch/firewall → APs → clients) ──
    const dev = {};
    dev.router = ins('network_devices', { name: 'Main Router', device_type: 'Router', asset_id: asset['NET-0001'], network_id: net.lan, isp_id: isp.converge, location_id: loc.SR, management_url: 'https://192.168.1.1', firmware_version: 'RouterOS 7.15', port_count: 10, status: 'Active' });
    dev.switch = ins('network_devices', { name: 'Core Switch', device_type: 'Managed Switch', asset_id: asset['SW-0001'], network_id: net.lan, parent_device_id: dev.router, location_id: loc.SR, management_url: 'https://192.168.1.2', firmware_version: '3.4.0.17', port_count: 28, status: 'Active' });
    dev.fw = ins('network_devices', { name: 'Server Firewall', device_type: 'Firewall', asset_id: asset['FW-0001'], network_id: net.srv, parent_device_id: dev.router, location_id: loc.SR, management_url: 'https://192.168.10.2', firmware_version: 'FortiOS 7.4.4', port_count: 5, status: 'Active' });
    dev.ap1 = ins('network_devices', { name: '2F Access Point', device_type: 'Access Point', asset_id: asset['AP-0001'], network_id: net.lan, parent_device_id: dev.switch, location_id: loc['2F'], management_url: 'https://192.168.1.3', firmware_version: '5.1.6', status: 'Active' });
    dev.ap2 = ins('network_devices', { name: '3F Access Point', device_type: 'Access Point', asset_id: asset['AP-0002'], network_id: net.lan, parent_device_id: dev.switch, location_id: loc['3F'], management_url: 'https://192.168.1.4', firmware_version: '5.1.6', status: 'Active' });
    db.run('UPDATE isps SET router_device_id = ? WHERE id IN (?, ?)', dev.router, isp.converge, isp.pldt);
    for (const [tag, d] of [['LAP-0001', 'ap1'], ['LAP-0002', 'ap1'], ['LAP-0003', 'ap1'], ['MOB-0001', 'ap1'], ['TAB-0001', 'ap2'], ['DESK-0001', 'switch'], ['PRN-0001', 'switch'], ['PRN-0002', 'switch'], ['SRV-0001', 'fw']]) {
      db.run('UPDATE assets SET connected_device_id = ? WHERE id = ?', dev[d], asset[tag]);
    }
    for (const [k, name] of [['router', 'Main Router'], ['switch', 'Core Switch'], ['fw', 'Server Firewall'], ['ap1', '2F Access Point'], ['ap2', '3F Access Point']]) activity('2025-01-22', 'Network device created', 'device', dev[k], name);

    // ── IP addresses ──
    const ip = (address, network, o = {}) => {
      const id = ins('ip_addresses', { address, address_num: ipu.ipToNum(address), network_id: net[network], asset_id: o.tag ? asset[o.tag] : null,
        device_name: o.device || null, hostname: o.host || null, mac_address: o.mac || (o.tag ? db.get('SELECT mac_address FROM assets WHERE id = ?', asset[o.tag]).mac_address : null),
        ip_type: o.type || 'Static', status: o.status || 'Active', notes: o.notes || null });
      if (o.tag) hist(o.tag, 'Network', `IP ${address} assigned`, o.date || '2025-01-22');
      if (o.tag || o.device) activity(o.date || '2025-01-22', 'IP assigned', 'ip', id, address, { asset: o.tag || o.device });
    };
    ip('192.168.1.1', 'lan', { tag: 'NET-0001', host: 'gw-main' });
    ip('192.168.1.2', 'lan', { tag: 'SW-0001', host: 'sw-core' });
    ip('192.168.1.3', 'lan', { tag: 'AP-0001', host: 'ap-2f' });
    ip('192.168.1.4', 'lan', { tag: 'AP-0002', host: 'ap-3f' });
    ip('192.168.1.10', 'lan', { tag: 'LAP-0001', host: 'lap-0001', date: '2026-01-10' });
    ip('192.168.1.11', 'lan', { tag: 'LAP-0002', host: 'lap-0002', date: '2023-10-20' });
    ip('192.168.1.12', 'lan', { tag: 'LAP-0003', host: 'lap-0003', date: '2026-06-11' });
    ip('192.168.1.20', 'lan', { tag: 'DESK-0001', host: 'desk-0001', date: '2025-03-15' });
    ip('192.168.1.30', 'lan', { tag: 'PRN-0001', host: 'prn-2f' });
    ip('192.168.1.31', 'lan', { tag: 'PRN-0002', host: 'prn-reception', status: 'Offline' });
    ip('192.168.1.45', 'lan', { device: 'Unknown device (duplicate ARP)', mac: 'AA:BB:CC:00:11:45', status: 'Conflict', notes: 'Two MACs answering for this address — investigate' });
    ip('192.168.1.50', 'lan', { device: 'Future CCTV NVR', type: 'Reserved', status: 'Reserved' });
    ip('192.168.1.51', 'lan', { type: 'Reserved', status: 'Reserved', notes: 'Reserved for conference room display' });
    ip('192.168.1.101', 'lan', { tag: 'MOB-0001', type: 'DHCP', host: 'mob-0001', date: '2026-01-12', notes: 'DHCP reservation' });
    ip('192.168.1.102', 'lan', { tag: 'TAB-0001', type: 'DHCP', host: 'tab-0001', date: '2025-07-21' });
    ip('192.168.10.1', 'srv', { device: 'Main Router (VLAN 10 interface)', host: 'gw-srv' });
    ip('192.168.10.2', 'srv', { tag: 'FW-0001', host: 'fw-01' });
    ip('192.168.10.10', 'srv', { tag: 'SRV-0001', host: 'srv-fs01' });
    ip('192.168.10.11', 'srv', { device: 'Synology DS923+ NAS', host: 'nas-01', mac: '00:11:32:AB:CD:11' });
    ip('192.168.10.12', 'srv', { tag: 'UPS-0001', host: 'ups-01', status: 'Assigned', notes: 'Network management card' });
    ip('192.168.20.1', 'guest', { device: 'Main Router (VLAN 20 interface)', host: 'gw-guest' });

    // ── Wi-Fi (fake passwords) ──
    for (const w of [
      { ssid: 'Company-WiFi', pw: 'Sample-WiFi-Pass-2026', security: 'WPA2/WPA3', band: 'Dual (2.4/5 GHz)', network_id: net.lan, access_point_id: dev.ap1, location_id: loc['2F'] },
      { ssid: 'Company-WiFi-3F', pw: 'Sample-WiFi-Exec-2026', security: 'WPA3-Personal', band: '5 GHz', network_id: net.lan, access_point_id: dev.ap2, location_id: loc['3F'] },
      { ssid: 'Pellas-Guest', pw: 'Welcome-Guest-2026', security: 'WPA2-Personal', band: '2.4 GHz', network_id: net.guest, access_point_id: dev.ap1, location_id: loc.GF, is_guest: 1, notes: 'Client isolation enabled; rotate monthly' },
    ]) {
      const id = ins('wifi_networks', { ssid: w.ssid, password_enc: vault.encrypt(w.pw), security: w.security, band: w.band, network_id: w.network_id, access_point_id: w.access_point_id, location_id: w.location_id, is_guest: w.is_guest || 0, notes: w.notes || null, created_by: ADMIN });
      activity('2025-01-23', 'Wi-Fi network created', 'wifi', id, w.ssid);
    }

    // ── Credential vault (clearly FAKE sample secrets) ──
    const cred = {};
    for (const c of [
      ['router', 'Main Router Admin', 'Router', { device_id: dev.router }, 'admin', 'SAMPLE-Router#2026', 'https://192.168.1.1', 'Winbox also enabled on LAN only'],
      ['switch', 'Core Switch Admin', 'Switch', { device_id: dev.switch }, 'cisco-admin', 'SAMPLE-Switch#2026', 'https://192.168.1.2', null],
      ['fw', 'FortiGate Admin', 'Firewall', { device_id: dev.fw }, 'fgt-admin', 'SAMPLE-Firewall#2026', 'https://192.168.10.2', 'MFA recommended before production'],
      ['ap', 'Omada Access Points', 'Access Point', { device_id: dev.ap1 }, 'omada-admin', 'SAMPLE-AP#2026', 'https://192.168.1.3', 'Same credential for AP-0001 and AP-0002'],
      ['srv', 'File Server Local Admin', 'Server', { asset_id: asset['SRV-0001'] }, 'Administrator', 'SAMPLE-Server#2026', 'rdp://192.168.10.10', null],
      ['conv', 'Converge Business Portal', 'ISP Account', { isp_id: isp.converge }, 'pellas-it@example.com', 'SAMPLE-Converge#2026', 'https://portal.converge.example', 'Account CNV-00012345'],
      ['pldt', 'PLDT Enterprise Portal', 'ISP Account', { isp_id: isp.pldt }, 'pellas-it@example.com', 'SAMPLE-PLDT#2026', 'https://portal.pldt.example', null],
      ['m365', 'Microsoft 365 Global Admin (sample)', 'Admin Account', {}, 'admin@pellas.example', 'SAMPLE-M365#2026', 'https://admin.microsoft.com', 'Break-glass account — sample only'],
    ]) {
      const [key, name, type, link, username, pw, url, notes] = c;
      cred[key] = ins('credentials', { name, credential_type: type, ...link, username, password_enc: vault.encrypt(pw), management_url: url, notes, created_by: ADMIN, updated_by: ADMIN });
      activity('2025-01-23', 'Credential created', 'credential', cred[key], name, { type });
    }
    // jtech may reveal only the AP credential.
    ins('credential_permissions', { credential_id: cred.ap, user_id: users.jtech, can_view: 1, can_reveal: 1, can_copy: 1 });
    activity(rel(-2), 'Credential revealed', 'credential', cred.router, 'Main Router Admin', { device: 'Main Router' });

    // ── Inventory audits ──
    const a1 = ins('inventory_audits', { name: 'Q2 2026 Main Office Audit', audit_date: '2026-06-28', status: 'Completed', notes: 'Quarterly physical count', created_by: ADMIN, completed_at: '2026-06-28 09:00:00' });
    const inScope = db.all(`SELECT a.id, a.asset_tag, a.status, l.name AS location FROM assets a LEFT JOIN locations l ON l.id = a.location_id WHERE a.asset_tag NOT IN ('LAP-0005')`);
    for (const x of inScope) {
      const result = x.asset_tag === 'HDS-0001' ? 'Missing' : 'Found';
      ins('audit_items', { audit_id: a1, asset_id: x.id, expected_status: x.status, expected_location: x.location, result, notes: result === 'Missing' ? 'Not in reception drawer; not found after search' : null, checked_by: ADMIN, checked_at: '2026-06-28 08:30:00' });
    }
    setStatus('HDS-0001', 'Lost');
    hist('HDS-0001', 'Audit', 'Inventory audit "Q2 2026 Main Office Audit": Missing', '2026-06-28');
    hist('HDS-0001', 'Status Changed', 'Marked Lost after audit "Q2 2026 Main Office Audit"', '2026-06-28');
    activity('2026-06-28', 'Inventory audit completed', 'audit', a1, 'Q2 2026 Main Office Audit', { applied: true });

    const a2 = ins('inventory_audits', { name: 'Q3 2026 2nd Floor Audit', audit_date: rel(-1), location_id: loc['2F'], status: 'In Progress', notes: 'Spot check of 2F open office', created_by: users.itstaff });
    const scope2 = db.all(`SELECT a.id, a.status, l.name AS location FROM assets a LEFT JOIN locations l ON l.id = a.location_id WHERE a.location_id = ? AND a.status NOT IN ('Retired','Disposed')`, loc['2F']);
    scope2.forEach((x, i) => ins('audit_items', { audit_id: a2, asset_id: x.id, expected_status: x.status, expected_location: x.location,
      result: i < 3 ? 'Found' : 'Pending', checked_by: i < 3 ? users.itstaff : null, checked_at: i < 3 ? `${rel(-1)} 02:00:00` : null }));
    activity(rel(-1), 'Inventory audit created', 'audit', a2, 'Q3 2026 2nd Floor Audit', { assets: scope2.length }, users.itstaff);

    // A few recent-looking entries for the dashboard feed.
    activity(rel(-3), 'Network device updated', 'device', dev.router, 'Main Router', { fields: 'firmware_version' });
    activity(TODAY, 'Signed in', 'user', ADMIN, 'admin');
  });
}

module.exports = { seed, seedBase };
