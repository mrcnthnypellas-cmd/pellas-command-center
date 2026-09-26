// End-to-end API tests for every workflow in the requirements checklist.
// Runs against a throwaway database in a temp folder: `npm test`.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'itms-test-'));
process.env.ITMS_DATA_DIR = tmp;
process.env.ITMS_DB_FILE = path.join(tmp, 'test.db');

const db = require('../server/db/connection');
const { seed } = require('../server/db/seed');
const { createApp } = require('../server/app');

let server;
let base;

before(async () => {
  seed();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

// Minimal cookie-aware client.
async function login(username, password) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(res.status, 200, `login ${username}`);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const call = async (method, url, body) => {
    const r = await fetch(`${base}/api${url}`, {
      method, headers: { Cookie: cookie, 'X-Requested-With': 'itms', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data = text;
    try { data = JSON.parse(text); } catch { /* csv / pdf / svg */ }
    return { status: r.status, data, text, headers: r.headers };
  };
  return {
    get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b), put: (u, b = {}) => call('PUT', u, b), del: (u) => call('DELETE', u), cookie,
  };
}
const ok = (r) => { assert.ok(r.status < 300, `${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const SECRETS = ['SAMPLE-Router#2026', 'SAMPLE-Switch#2026', 'SAMPLE-AP#2026', 'Sample-WiFi-Pass-2026', 'Rotated#Secret-99'];
const noSecrets = (s, where) => { for (const x of SECRETS) assert.ok(!String(s).includes(x), `secret leaked in ${where}`); };

test('authentication: bad password rejected, CSRF header required', async () => {
  const bad = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'nope' }) });
  assert.equal(bad.status, 401);
  // Username is case-insensitive and ignores spaces a phone keyboard may add.
  const spaced = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ' Admin ', password: 'admin123' }) });
  assert.equal(spaced.status, 200);
  const anon = await fetch(`${base}/api/assets`);
  assert.equal(anon.status, 401);
  const a = await login('admin', 'admin123');
  const noHeader = await fetch(`${base}/api/assets`, { method: 'POST', headers: { Cookie: a.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
});

test('asset lifecycle: add, edit, assign, transfer, return, maintenance, retire, history, dashboard', async () => {
  const a = await login('admin', 'admin123');
  const before = ok(await a.get('/dashboard'));
  const L = ok(await a.get('/settings/lookups'));
  const laptopCat = L.categories.find((c) => c.prefix === 'LAP').id;

  // Add (auto tag)
  const created = ok(await a.post('/assets', { name: 'Dell Latitude 7450', category_id: laptopCat, brand: 'Dell', serial_number: 'TEST-SN-1', warranty_end: '2029-01-01', purchase_date: '2026-09-01' }));
  assert.equal(created.asset_tag, 'LAP-0006');
  assert.equal(created.status, 'Available');
  let dash = ok(await a.get('/dashboard'));
  assert.equal(dash.assets.total, before.assets.total + 1);
  assert.equal(dash.assets.Available, before.assets.Available + 1);

  // Edit
  const edited = ok(await a.put(`/assets/${created.id}`, { model: 'Latitude 7450', notes: 'Edited' }));
  assert.equal(edited.model, 'Latitude 7450');

  // Cannot set Deployed by hand
  assert.equal((await a.put(`/assets/${created.id}`, { status: 'Deployed' })).status, 400);

  // Assign (deploy)
  const juan = L.employees.find((e) => e.full_name === 'Juan Dela Cruz');
  const dep = ok(await a.post('/assignments/deploy', { asset_id: created.id, employee_id: juan.id, condition_on_assign: 'New' }));
  assert.equal(dep.asset.status, 'Deployed');
  assert.equal(dep.asset.employee_name, 'Juan Dela Cruz');
  const juanProfile = ok(await a.get(`/employees/${juan.id}`));
  assert.ok(juanProfile.assets.some((x) => x.id === created.id), 'employee profile shows the asset immediately');
  dash = ok(await a.get('/dashboard'));
  assert.equal(dash.assets.Deployed, before.assets.Deployed + 1);
  // Double deploy is blocked
  assert.equal((await a.post('/assignments/deploy', { asset_id: created.id, employee_id: juan.id })).status, 400);

  // Transfer — previous assignment is kept
  const pedro = L.employees.find((e) => e.full_name === 'Pedro Santos');
  const tr = ok(await a.post('/assignments/transfer', { asset_id: created.id, to_employee_id: pedro.id, reason: 'Role change', approved_by: 'Mark Villanueva' }));
  assert.equal(tr.asset.employee_name, 'Pedro Santos');
  let full = ok(await a.get(`/assets/${created.id}`));
  assert.equal(full.assignments.length, 2);
  assert.deepEqual(full.assignments.map((x) => x.status).sort(), ['Active', 'Transferred']);

  // Maintenance while deployed → Under Repair, completion → back to Deployed
  const m = ok(await a.post('/maintenance', { asset_id: created.id, issue: 'Fan noise', status: 'Under Repair' }));
  full = ok(await a.get(`/assets/${created.id}`));
  assert.equal(full.status, 'Under Repair');
  ok(await a.put(`/maintenance/${m.id}`, { status: 'Completed', repair_cost: 500 }));
  full = ok(await a.get(`/assets/${created.id}`));
  assert.equal(full.status, 'Deployed');

  // Return with condition → Damaged
  const ret = await fetch(`${base}/api/assignments/return`, {
    method: 'POST', headers: { Cookie: a.cookie, 'X-Requested-With': 'itms' },
    body: (() => { const f = new FormData(); f.append('asset_id', created.id); f.append('condition_on_return', 'Cracked hinge'); f.append('resulting_status', 'Damaged'); return f; })(),
  });
  assert.equal(ret.status, 201);
  full = ok(await a.get(`/assets/${created.id}`));
  assert.equal(full.status, 'Damaged');
  assert.equal(full.employee_id, null);
  assert.equal(full.assignments.length, 2, 'assignments are never deleted');

  // History timeline has every step
  const types = full.history.map((h) => h.event_type);
  for (const t of ['Purchased', 'Created', 'Assigned', 'Transferred', 'Maintenance', 'Repair Completed', 'Returned']) assert.ok(types.includes(t), `history has ${t}`);

  // Delete is refused once there is history; retire works
  assert.equal((await a.del(`/assets/${created.id}`)).status, 400);
  const retired = ok(await a.post(`/assets/${created.id}/retire`, { reason: 'Beyond repair' }));
  assert.equal(retired.status, 'Retired');

  // A never-assigned asset can be deleted
  const temp = ok(await a.post('/assets', { name: 'Temp', category_id: laptopCat }));
  ok(await a.del(`/assets/${temp.id}`));
  assert.equal((await a.get(`/assets/${temp.id}`)).status, 404);
});

test('asset filters, search and QR code', async () => {
  const a = await login('itstaff', 'itstaff123');
  const deployed = ok(await a.get('/assets?status=Deployed'));
  assert.ok(deployed.length > 0 && deployed.every((x) => x.status === 'Deployed'));
  const bySearch = ok(await a.get('/assets?q=ABC123456'));
  assert.equal(bySearch[0].asset_tag, 'LAP-0001');
  const qr = await a.get('/assets/LAP-0001/qr.svg');
  assert.equal(qr.status, 200);
  assert.match(qr.text, /<svg/);

  // Global search by IP returns the whole relationship
  const s = ok(await a.get('/search?q=192.168.1.10'));
  const ip = s.results.ips.find((i) => i.address === '192.168.1.10');
  assert.equal(ip.asset_tag, 'LAP-0001');
  assert.equal(ip.employee_name, 'Juan Dela Cruz');
  assert.equal(ip.network_name, 'Main Office LAN');
  assert.equal(ip.isp_name, 'Converge');
  // by MAC and by employee
  assert.ok(ok(await a.get('/search?q=8C:04:BA:11:22:01')).results.ips.length);
  assert.ok(ok(await a.get('/search?q=Maria')).results.employees.length);

  // Asset → IP → network → devices → ISP relationship
  const lap = ok(await a.get('/assets/LAP-0001'));
  assert.equal(lap.relationship.network.cidr, '192.168.1.0/24');
  assert.equal(lap.relationship.isp.provider_name, 'Converge');
  assert.deepEqual(lap.relationship.devices.map((d) => d.device_type), ['Access Point', 'Managed Switch', 'Router']);
});

test('printable QR asset labels', async () => {
  const a = await login('itstaff', 'itstaff123');
  const meta = ok(await a.get('/assets/labels/sizes'));
  assert.ok(meta.sizes.some((z) => z.key === 'a4-21'));
  // QR can carry the bare asset number or a profile link; never anything secret.
  const tagQr = await a.get('/assets/1/qr.svg?mode=tag');
  assert.match(tagQr.text, /<svg/);
  assert.equal((await a.get('/assets/labels.pdf')).status, 400, 'no assets selected');
  for (const size of meta.sizes) {
    const r = await fetch(`${base}/api/assets/labels.pdf?ids=1,2,3&size=${size.key}&serial=1&cut=1&copies=2&skip=1`, { headers: { Cookie: a.cookie } });
    assert.equal(r.status, 200, size.key);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    const pdf = Buffer.from(await r.arrayBuffer());
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
    const expected = Math.ceil((1 + 3 * 2) / (size.cols * size.rows));
    assert.equal(pages, size.cols * size.rows === 1 ? 6 : expected, `${size.key} page count`);
  }
  const logs = ok(await a.get('/activity?q=labels'));
  assert.ok(logs.some((l) => l.action === 'Asset labels generated (PDF)'));
});

test('asset import and export (Excel and CSV)', async () => {
  const ExcelJS = require('exceljs');
  const a = await login('admin', 'admin123');
  const upload = async (name, content, fields = {}) => {
    const f = new FormData();
    f.append('file', new Blob([content]), name);
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    const r = await fetch(`${base}/api/assets/import`, { method: 'POST', headers: { Cookie: a.cookie, 'X-Requested-With': 'itms' }, body: f });
    return { status: r.status, data: await r.json() };
  };

  // Export → import back unchanged: nothing to do.
  const xr = await fetch(`${base}/api/assets/export?format=xlsx`, { headers: { Cookie: a.cookie } });
  assert.match(xr.headers.get('content-type'), /spreadsheetml/);
  const xbuf = Buffer.from(await xr.arrayBuffer());
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(xbuf);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Assets', 'Lists']);
  const count = ok(await a.get('/assets')).length;
  assert.equal(wb.getWorksheet('Assets').actualRowCount, count + 1);
  const round = await upload('assets.xlsx', xbuf);
  assert.equal(round.status, 200, JSON.stringify(round.data));
  assert.equal(round.data.summary.unchanged, count, JSON.stringify(round.data.rows.filter((r) => r.action !== 'unchanged').slice(0, 3)));
  assert.equal(round.data.summary.errors, 0);

  // Edit the exported workbook in "Excel": change one asset, add one new, then import.
  const ws = wb.getWorksheet('Assets');
  const headers = ws.getRow(1).values;
  const col = (h) => headers.indexOf(h);
  ws.getRow(2).getCell(col('Notes')).value = 'Updated from Excel';
  ws.addRow(Object.assign([], { [col('Asset Name')]: 'Epson EcoTank L3250', [col('Category')]: 'Printer', [col('Purchase Date')]: new Date(Date.UTC(2026, 8, 1)), [col('Purchase Cost')]: 9990, [col('Location')]: 'Branch Office - Cebu' }));
  const edited = Buffer.from(await wb.xlsx.writeBuffer());
  const check = await upload('assets.xlsx', edited);
  assert.equal(check.data.summary.update, 1);
  assert.equal(check.data.summary.create, 1);
  assert.deepEqual(check.data.new_lookups.locations, ['Branch Office - Cebu']);
  const created = check.data.rows.find((r) => r.action === 'create');
  assert.equal(created.asset_tag, 'PRN-0003');
  assert.equal((await a.get('/assets/PRN-0003')).status, 404, 'the check step must not write anything');
  const done = await upload('assets.xlsx', edited, { commit: '1' });
  assert.deepEqual(done.data.result, { created: 1, updated: 1, assigned: 0, failed: 0 });
  const prn = ok(await a.get('/assets/PRN-0003'));
  assert.equal(prn.location, 'Branch Office - Cebu');
  assert.equal(prn.purchase_date, '2026-09-01');
  assert.ok(prn.history.some((h) => h.description.includes('imported from assets.xlsx')));

  // CSV (semicolon-separated, as saved by Excel in some regions) with aliases, errors and an assignment.
  const csv = '﻿Tag;Item Name;Type;Serial;Assigned To;Purchase Date;Cost;Status\n'
    + ';"Lenovo ThinkPad E14; Gen 5";Laptop;LNV-E14-01;EMP-005;01/15/2026;"₱55,000.00";\n'
    + ';Mystery Box;Gadget;;;;;\n'
    + ';HP Mouse;Keyboard;;;2026-13-40;;\n'
    + 'LAP-0004;;;;EMP-007;;;\n'
    + 'MON-0001;;;;;;;Lost\n';
  const c1 = await upload('list.csv', csv, { create_lookups: '0' });
  assert.equal(c1.status, 200, JSON.stringify(c1.data));
  const byRow = Object.fromEntries(c1.data.rows.map((r) => [r.row, r]));
  assert.equal(byRow[2].action, 'create');
  assert.match(byRow[2].asset_tag, /^LAP-\d{4}$/);
  const newTag = byRow[2].asset_tag;
  assert.equal(byRow[2].assign_to, 'Mark Villanueva (EMP-005)');
  assert.match(byRow[3].errors.join(), /Unknown category “Gadget”/);
  assert.match(byRow[4].errors.join(), /not a real date/);
  assert.equal(byRow[5].action, 'update');
  assert.equal(byRow[5].assign_to, 'Rosa Mercado (EMP-007)');
  assert.deepEqual([byRow[6].action, byRow[6].changes], ['update', ['Status']], 'an assigned asset can be marked Lost');
  const c2 = await upload('list.csv', csv, { create_lookups: '0', commit: '1' });
  assert.deepEqual(c2.data.result, { created: 1, updated: 2, assigned: 2, failed: 0 });
  // Available/Retired while still assigned is refused, same as the edit form.
  const c4 = await upload('y.csv', 'Asset Tag,Status\nLAP-0001,Available\n');
  assert.match(c4.data.rows[0].errors.join(), /still assigned/);
  const lap6 = ok(await a.get(`/assets/${newTag}`));
  assert.equal(lap6.name, 'Lenovo ThinkPad E14; Gen 5');
  assert.equal(lap6.purchase_cost, 55000);
  assert.equal(lap6.employee_name, 'Mark Villanueva');
  assert.equal(lap6.status, 'Deployed');
  assert.equal(ok(await a.get('/assets/LAP-0004')).employee_name, 'Rosa Mercado');

  // "Add new only" skips existing tags; bad files are rejected clearly.
  // A new location used only by a row with errors is not created.
  const c5 = await upload('z.csv', 'Asset Name,Category,Location\nThing,Gadget,Nowhere Annex\n');
  assert.deepEqual(c5.data.new_lookups.locations, []);
  const c3 = await upload('x.csv', 'Asset Tag,Asset Name,Category\nLAP-0001,Changed name,Laptop\n', { mode: 'create_only' });
  assert.equal(c3.data.summary.skip, 1);
  assert.equal((await upload('x.csv', 'foo,bar\n1,2\n')).status, 400);
  assert.equal((await upload('x.xls', 'junk')).status, 400);
  assert.equal((await upload('x.xlsx', 'not really excel')).status, 400);

  // CSV export neutralises spreadsheet formulas; template downloads; viewer can't import.
  ok(await a.put(`/assets/${lap6.id}`, { notes: '=HYPERLINK("http://evil")' }));
  const ecsv = await a.get(`/assets/export?format=csv&q=${newTag}`);
  assert.ok(ecsv.text.includes("'=HYPERLINK"));
  const t = await fetch(`${base}/api/assets/import/template`, { headers: { Cookie: a.cookie } });
  const twb = new ExcelJS.Workbook(); await twb.xlsx.load(Buffer.from(await t.arrayBuffer()));
  assert.deepEqual(twb.worksheets.map((w) => w.name), ['Assets', 'How to import', 'Lists']);
  const viewer = await login('viewer', 'viewer123');
  const vf = new FormData(); vf.append('file', new Blob(['a']), 'x.csv');
  assert.equal((await fetch(`${base}/api/assets/import`, { method: 'POST', headers: { Cookie: viewer.cookie, 'X-Requested-With': 'itms' }, body: vf })).status, 403);
  assert.equal((await viewer.get('/assets/export')).status, 403);
});

test('IP, network, ISP and network device management', async () => {
  const a = await login('admin', 'admin123');
  const net = ok(await a.post('/network/networks', { name: 'CCTV Network', cidr: '10.10.30.0/24', gateway: '10.10.30.1', dhcp_start: '10.10.30.100', dhcp_end: '10.10.30.150' }));
  assert.equal((await a.post('/network/networks', { name: 'dup', cidr: '10.10.30.0/24' })).status, 400);
  assert.equal((await a.post('/network/networks', { name: 'bad', cidr: '10.10.30.0' })).status, 400);
  const next = ok(await a.get(`/network/networks/${net.id}/next-ip`));
  assert.equal(next.address, '10.10.30.2');

  assert.equal((await a.post('/network/ips', { network_id: net.id, address: '10.10.31.5' })).status, 400, 'outside subnet');
  const ip = ok(await a.post('/network/ips', { network_id: net.id, address: '10.10.30.20', device_name: 'NVR', ip_type: 'Static', mac_address: 'aa-bb-cc-dd-ee-ff' }));
  assert.equal(ip.mac_address, 'AA:BB:CC:DD:EE:FF');
  assert.equal(ip.status, 'Assigned');
  assert.equal((await a.post('/network/ips', { network_id: net.id, address: '10.10.30.20' })).status, 400, 'duplicate');
  ok(await a.put(`/network/ips/${ip.id}`, { status: 'Conflict' }));
  const dash = ok(await a.get('/dashboard'));
  assert.ok(dash.alerts.ip_conflicts >= 2);
  const nets = ok(await a.get('/network/networks'));
  const util = nets.find((n) => n.id === net.id);
  assert.equal(util.total, 254);
  assert.equal(util.used, 1);

  const isp = ok(await a.post('/network/isps', { provider_name: 'Globe Business', connection_name: 'Branch', role: 'Backup', status: 'Active', contract_end: '2026-10-01' }));
  const upd = ok(await a.put(`/network/isps/${isp.id}`, { status: 'Down' }));
  assert.equal(upd.status, 'Down');
  assert.equal(upd.status_source, 'manual');

  const dev = ok(await a.post('/network/devices', { name: 'CCTV Switch', device_type: 'Switch', network_id: net.id, parent_device_id: 1 }));
  const detail = ok(await a.get(`/network/devices/${dev.id}`));
  assert.equal(detail.upstream_isp.provider_name, 'Converge');
  assert.equal((await a.put('/network/devices/1', { parent_device_id: dev.id })).status, 400, 'uplink loop prevented');
  const topo = ok(await a.get('/network/topology'));
  assert.ok(topo.isps.find((i) => i.provider_name === 'Converge').devices[0].children.some((c) => c.id === dev.id));
});

test('credential vault: encrypted at rest, masked in responses, permission-checked reveal, audit without secret', async () => {
  const admin = await login('admin', 'admin123');
  const viewer = await login('viewer', 'viewer123');
  const jtech = await login('jtech', 'jtech123');

  const list = await admin.get('/vault/credentials');
  noSecrets(list.text, 'credential list');
  assert.ok(!list.text.includes('password_enc') && !list.text.includes('v1:'), 'ciphertext not exposed');

  const router = list.data.find((c) => c.name === 'Main Router Admin');
  const ap = list.data.find((c) => c.name === 'Omada Access Points');
  const rev = ok(await admin.post(`/vault/credentials/${router.id}/secret`, { purpose: 'reveal' }));
  assert.equal(rev.password, 'SAMPLE-Router#2026');
  assert.equal(rev.password && (await admin.post(`/vault/credentials/${router.id}/secret`, { purpose: 'reveal' })).headers.get('cache-control'), 'no-store');

  // Viewer: no access at all
  assert.equal((await viewer.get('/vault/credentials')).status, 403);
  assert.equal((await viewer.post(`/vault/credentials/${router.id}/secret`, { purpose: 'reveal' })).status, 403);
  assert.equal((await viewer.post('/vault/wifi/1/secret', { purpose: 'reveal' })).status, 403);
  // jtech: IT Staff with reveal denied globally, but granted on the AP credential only
  assert.equal((await jtech.post(`/vault/credentials/${router.id}/secret`, { purpose: 'reveal' })).status, 403);
  assert.equal(ok(await jtech.post(`/vault/credentials/${ap.id}/secret`, { purpose: 'copy' })).password, 'SAMPLE-AP#2026');
  assert.equal((await jtech.post('/vault/credentials', { name: 'x', credential_type: 'Other', password: 'y' })).status, 403);

  // Create / edit (rotate) / delete
  const c = ok(await admin.post('/vault/credentials', { name: 'Test NAS', credential_type: 'Server', username: 'nas', password: 'Rotated#Secret-99' }));
  ok(await admin.put(`/vault/credentials/${c.id}`, { password: 'Rotated#Secret-99', notes: 'rotated' }));
  ok(await admin.del(`/vault/credentials/${c.id}`));

  // Nothing secret in the database in plain text, in logs, or in reports
  const raw = fs.readFileSync(process.env.ITMS_DB_FILE);
  db.open().pragma('wal_checkpoint(TRUNCATE)');
  noSecrets(fs.readFileSync(process.env.ITMS_DB_FILE).toString('latin1') + raw.toString('latin1'), 'database file');
  const logs = await admin.get('/activity?limit=2000');
  noSecrets(logs.text, 'activity log');
  assert.ok(logs.data.some((l) => l.action === 'Credential revealed' && l.entity_label === 'Main Router Admin'));
  assert.ok(logs.data.some((l) => l.action === 'Credential reveal denied' && l.user_name === 'Jose Tan'));
  for (const key of ['inventory', 'devices', 'isps', 'ips', 'history']) {
    noSecrets((await admin.get(`/reports/${key}?format=csv`)).text, `report ${key}`);
  }
  const wifi = await admin.get('/vault/wifi');
  noSecrets(wifi.text, 'wifi list');
  assert.equal(ok(await admin.post('/vault/wifi/1/secret', { purpose: 'reveal' })).password, 'Sample-WiFi-Pass-2026');
});

test('permission system: roles, overrides, read-only viewer', async () => {
  const admin = await login('admin', 'admin123');
  const viewer = await login('viewer', 'viewer123');
  assert.equal((await viewer.post('/assets', { name: 'x', category_id: 1 })).status, 403);
  assert.equal((await viewer.get('/assets')).status, 200);
  assert.equal((await viewer.get('/users')).status, 403);
  const me = ok(await viewer.get('/auth/me'));
  assert.ok(!me.permissions.some((p) => p.startsWith('credentials.')));

  // Grant the viewer assets.create individually, then revoke
  const users = ok(await admin.get('/users'));
  const v = users.find((u) => u.username === 'viewer');
  ok(await admin.put(`/users/${v.id}/permissions`, { overrides: [{ permission_key: 'assets.create', granted: 1 }] }));
  assert.equal((await viewer.post('/assets', { name: 'Viewer-made', category_id: 1 })).status, 201);
  ok(await admin.put(`/users/${v.id}/permissions`, { overrides: [] }));
  assert.equal((await viewer.post('/assets', { name: 'x', category_id: 1 })).status, 403);
  // Last admin cannot be demoted
  const adm = users.find((u) => u.username === 'admin');
  assert.equal((await admin.put(`/users/${adm.id}`, { role_id: v.role_id })).status, 400);
});

test('warranty, inventory audit, reports and activity log', async () => {
  const a = await login('admin', 'admin123');
  const exp = ok(await a.get('/maintenance/warranty/list?filter=expiring&days=30'));
  assert.ok(exp.length >= 2 && exp.every((x) => x.days_left >= 0 && x.days_left <= 30));
  const expired = ok(await a.get('/maintenance/warranty/list?filter=expired'));
  assert.ok(expired.every((x) => x.days_left < 0));

  const audit = ok(await a.post('/audits', { name: 'Test audit', location_id: 4 }));
  const au = ok(await a.get(`/audits/${audit.id}`));
  assert.ok(au.items.length > 0);
  const [first, second] = au.items;
  ok(await a.put(`/audits/${audit.id}/items/${first.id}`, { result: 'Found' }));
  ok(await a.put(`/audits/${audit.id}/items/${second.id}`, { result: 'Missing', notes: 'Not on rack' }));
  const dashBefore = ok(await a.get('/dashboard'));
  ok(await a.post(`/audits/${audit.id}/complete`, { apply_statuses: true }));
  const lost = ok(await a.get(`/assets/${second.asset_id}`));
  assert.equal(lost.status, 'Lost');
  const dashAfter = ok(await a.get('/dashboard'));
  assert.equal(dashAfter.assets.Lost, dashBefore.assets.Lost + 1);
  const rep = ok(await a.get(`/reports/audit?audit_id=${audit.id}`));
  assert.equal(rep.rows.length, au.items.length);

  const reports = ok(await a.get('/reports'));
  assert.ok(reports.length >= 16);
  for (const r of reports) {
    const j = await a.get(`/reports/${r.key}`);
    assert.equal(j.status, 200, r.key);
  }
  const csv = await a.get('/reports/inventory?format=csv');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const pdf = await fetch(`${base}/api/reports/inventory?format=pdf`, { headers: { Cookie: a.cookie } });
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');

  const viewer = await login('viewer', 'viewer123');
  assert.equal((await viewer.get('/reports/inventory?format=csv')).status, 403, 'viewer cannot export');

  const logs = ok(await a.get('/activity?q=Asset'));
  assert.ok(logs.length > 0 && logs[0].user_name);
});

test('branding: editable names and sign-in background', async () => {
  const a = await login('admin', 'admin123');
  const pub0 = await (await fetch(`${base}/api/public/branding`)).json();
  assert.equal(pub0.system_name, 'IT Management System');
  assert.equal(pub0.login_bg_url, null);
  const b = ok(await a.put('/settings/branding', { company_name: 'Pellas Corp', system_name: 'IT Command Center', dashboard_title: 'IT Overview', dashboard_subtitle: 'All our gear', login_bg_preset: 'navy', login_message: 'Welcome back' }));
  assert.equal(b.dashboard_title, 'IT Overview');
  assert.equal(ok(await a.get('/auth/me')).company.system_name, 'IT Command Center');
  assert.equal((await a.put('/settings/branding', { dashboard_title: '   ' })).status, 400, 'names cannot be blank');
  assert.equal((await a.put('/settings/branding', { login_bg_preset: 'rainbow' })).status, 400);

  // Background photo: images only; served publicly for the sign-in page.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const put = async (file, name, type, user = a) => {
    const f = new FormData(); f.append('login_bg', new Blob([file], { type }), name);
    return fetch(`${base}/api/settings/branding`, { method: 'PUT', headers: { Cookie: user.cookie, 'X-Requested-With': 'itms' }, body: f });
  };
  assert.equal((await put(Buffer.from('%PDF-1.4'), 'x.pdf', 'application/pdf')).status, 400);
  assert.equal((await put(png, 'office.png', 'image/png')).status, 200);
  const pub = await (await fetch(`${base}/api/public/branding`)).json();
  assert.equal(pub.company_name, 'Pellas Corp');
  assert.equal(pub.login_message, 'Welcome back');
  assert.equal(pub.login_bg_preset, 'navy');
  const img = await fetch(`${base}${pub.login_bg_url}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  // The public endpoint exposes only presentation settings.
  assert.deepEqual(Object.keys(pub).sort(), ['company_name', 'dashboard_subtitle', 'dashboard_title', 'login_bg_preset', 'login_bg_url', 'login_message', 'logo_url', 'presets', 'system_name']);
  // Other uploads stay private.
  assert.equal((await fetch(`${base}/uploads/${'x'.repeat(8)}.png`)).status, 401);
  const viewer = await login('viewer', 'viewer123');
  assert.equal((await viewer.put('/settings/branding', { dashboard_title: 'Hacked' })).status, 403);
  assert.equal((await put(png, 'v.png', 'image/png', viewer)).status, 403);
  // Remove the photo again.
  const f = new FormData(); f.append('remove_login_bg', '1');
  await fetch(`${base}/api/settings/branding`, { method: 'PUT', headers: { Cookie: a.cookie, 'X-Requested-With': 'itms' }, body: f });
  assert.equal((await (await fetch(`${base}/api/public/branding`)).json()).login_bg_url, null);
  assert.equal((await fetch(`${base}/api/public/login-background`)).status, 404);
  ok(await a.put('/settings/branding', { company_name: 'Pellas Corporation', system_name: 'IT Management System', dashboard_title: 'Dashboard' }));
});

test('employees and settings CRUD', async () => {
  const a = await login('admin', 'admin123');
  const code = ok(await a.get('/employees/next-code')).code;
  assert.equal(code, 'EMP-008');
  const f = new FormData();
  f.append('full_name', 'Test Person'); f.append('department_id', '1');
  const r = await fetch(`${base}/api/employees`, { method: 'POST', headers: { Cookie: a.cookie, 'X-Requested-With': 'itms' }, body: f });
  const e = await r.json();
  assert.equal(e.employee_code, 'EMP-008');
  const without = ok(await a.get('/employees?has_assets=0'));
  assert.ok(without.some((x) => x.id === e.id));
  ok(await a.del(`/employees/${e.id}`));
  // Employee with assets cannot resign until assets are returned
  const juan = ok(await a.get('/employees?q=Juan'))[0];
  assert.equal((await a.put(`/employees/${juan.id}`, { status: 'Resigned' })).status, 400);

  const dep = ok(await a.post('/settings/departments', { name: 'Sales' }));
  assert.equal((await a.post('/settings/departments', { name: 'Sales' })).status, 400);
  ok(await a.del(`/settings/departments/${dep.id}`));
  assert.equal((await a.del('/settings/departments/1')).status, 400, 'in-use department protected');
  ok(await a.put('/settings/company', { tag_padding: '3' }));
  const cat = ok(await a.get('/settings/lookups')).categories.find((c) => c.prefix === 'MON');
  assert.equal(ok(await a.get(`/assets/next-tag?category_id=${cat.id}`)).tag, 'MON-004');
  ok(await a.put('/settings/company', { tag_padding: '4' }));
});
