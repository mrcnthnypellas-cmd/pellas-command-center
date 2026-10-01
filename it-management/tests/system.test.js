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

// License keys: the tests sign with a throwaway key pair instead of the owner's private key.
const crypto = require('crypto');
const { makeKey } = require('../tools/license/sign');
const TEST_PRIV = crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(16).toString('hex');
const TEST_PUB = require('../tools/license/sign').publicKeyHex(TEST_PRIV);
require('../server/lib/licenseKey').publicKeyHex = TEST_PUB;
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const testKey = (company = 'Pellas Corporation', days = 365) => makeKey(TEST_PRIV, { company, expires: day(days) });
const license = require('../server/lib/license');

let server;
let base;

before(async () => {
  seed();
  license.activate(testKey());
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
  // Last admin cannot be demoted, disabled or deleted; nobody can delete or disable themselves.
  const adm = users.find((u) => u.username === 'admin');
  assert.equal((await admin.put(`/users/${adm.id}`, { role_id: v.role_id })).status, 400);
  assert.equal((await admin.del(`/users/${adm.id}`)).status, 400);
  assert.equal((await admin.put(`/users/${adm.id}`, { status: 'Disabled' })).status, 400);
  assert.equal((await admin.put(`/users/${v.id}`, { status: 'Deleted' })).status, 400, 'delete only via Delete');

  // Disable is reversible.
  ok(await admin.put(`/users/${v.id}`, { status: 'Disabled' }));
  assert.equal((await viewer.get('/assets')).status, 401, 'disabled user is signed out');
  ok(await admin.put(`/users/${v.id}`, { status: 'Active' }));
  await login('viewer', 'viewer123'); // re-enabled user can sign in again

  // Delete removes the account from the system but keeps its name on history.
  const tmp = ok(await admin.post('/users', { username: 'temp.tech', full_name: 'Temp Technician', role_id: users.find((u) => u.username === 'itstaff').role_id, password: 'longpassword1' }));
  const tt = await login('temp.tech', 'longpassword1');
  ok(await tt.post('/assets', { name: 'Made by temp', category_id: 1 }));
  ok(await admin.put(`/users/${tmp.id}/permissions`, { overrides: [{ permission_key: 'users.manage', granted: 0 }] }));
  ok(await admin.put('/vault/credentials/1/permissions', { grants: [{ user_id: tmp.id, can_reveal: 1, can_copy: 1 }] }));
  ok(await admin.del(`/users/${tmp.id}`));
  assert.equal((await tt.get('/assets')).status, 401, 'deleted user is signed out');
  const bad = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'temp.tech', password: 'longpassword1' }) });
  assert.equal(bad.status, 401, 'deleted user cannot sign in');
  assert.ok(!ok(await admin.get('/users')).some((u) => u.id === tmp.id), 'gone from the user list');
  assert.ok(!ok(await admin.get('/vault/credentials/1/permissions')).some((u) => u.user_id === tmp.id), 'gone from credential access');
  assert.equal((await admin.get(`/users/${tmp.id}/permissions`)).status, 404);
  assert.equal((await admin.put(`/users/${tmp.id}`, { status: 'Active' })).status, 404, 'cannot be brought back by editing');
  assert.equal((await admin.del(`/users/${tmp.id}`)).status, 404);
  const created = ok(await admin.get('/activity?entity_type=asset&limit=50')).find((l) => l.action === 'Asset created' && l.user_name === 'Temp Technician');
  assert.ok(created, 'history keeps the deleted person\'s name');
  // The username can be reused.
  ok(await admin.post('/users', { username: 'temp.tech', full_name: 'New Temp', role_id: v.role_id, password: 'anotherpass1' }));
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

test('backup on one PC, restore on another', async () => {
  const { spawn } = require('child_process');
  const a = await login('admin', 'admin123');
  // Data that only exists on "PC 1": a new asset with a photo and a new saved password.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const fa = new FormData();
  fa.append('name', 'Only-on-PC1 Laptop'); fa.append('category_id', '1'); fa.append('photo', new Blob([png], { type: 'image/png' }), 'p.png');
  const made = await (await fetch(`${base}/api/assets`, { method: 'POST', headers: { Cookie: a.cookie, 'X-Requested-With': 'itms' }, body: fa })).json();
  const cred = ok(await a.post('/vault/credentials', { name: 'PC1 NAS', credential_type: 'Server', username: 'nas', password: 'Moved#Across-PCs1' }));

  const dl = await fetch(`${base}/api/backup/download`, { method: 'POST', headers: { Cookie: a.cookie, 'X-Requested-With': 'itms', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'backup-pass-123', confirm: 'backup-pass-123' }) });
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /\.itmsbackup"/);
  const file = Buffer.from(await dl.arrayBuffer());
  assert.equal(file.subarray(0, 8).toString(), 'ITMSBAK1');
  assert.ok(!file.includes(Buffer.from('Only-on-PC1')), 'backup contents are encrypted');
  assert.equal((await a.post('/backup/download', { password: 'short' })).status, 400);
  const viewer = await login('viewer', 'viewer123');
  assert.equal((await viewer.post('/backup/download', { password: 'backup-pass-123' })).status, 403);

  // "PC 2": a separate installation with its own data folder and its own encryption key.
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'itms-pc2-'));
  const port2 = 40000 + Math.floor(Math.random() * 20000);
  const pc2 = spawn(process.execPath, ['-r', path.join(__dirname, 'license-preload.js'), path.join(__dirname, '../server/index.js')], { env: { ...process.env, ITMS_TEST_LICENSE_PUB: TEST_PUB, PORT: String(port2), ITMS_DATA_DIR: dir2, ITMS_DB_FILE: path.join(dir2, 'itms.db') }, stdio: 'pipe' });
  try {
    await new Promise((resolve, reject) => { pc2.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }); pc2.on('exit', reject); setTimeout(() => reject(new Error('PC2 did not start')), 20000); });
    const b2 = `http://127.0.0.1:${port2}`;
    const login2 = async (u, p) => {
      const res = await fetch(`${b2}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
      return res.status === 200 ? res.headers.get('set-cookie').split(';')[0] : null;
    };
    const send = async (cookie, pathname, fields) => {
      const f = new FormData();
      f.append('file', new Blob([fields.file ?? file]), 'backup.itmsbackup');
      for (const [k, v] of Object.entries(fields)) if (k !== 'file') f.append(k, v);
      const res = await fetch(`${b2}/api/backup/${pathname}`, { method: 'POST', headers: { Cookie: cookie, 'X-Requested-With': 'itms' }, body: f });
      return { status: res.status, data: await res.json() };
    };
    // A new install starts at the first-run setup.
    const setup2 = await fetch(`${b2}/api/public/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'itms' }, body: JSON.stringify({ company_name: 'PC Two', full_name: 'PC Two Admin', username: 'admin', password: 'admin123', license_key: testKey('PC Two') }) });
    assert.equal(setup2.status, 200);
    const c2 = await login2('admin', 'admin123');
    assert.equal((await send(c2, 'check', { password: 'wrong-password-1' })).status, 400);
    const tampered = Buffer.from(file); tampered[tampered.length - 5] ^= 0xff;
    assert.match((await send(c2, 'check', { password: 'backup-pass-123', file: tampered })).data.error, /Wrong backup password|damaged/);
    assert.match((await send(c2, 'check', { password: 'backup-pass-123', file: Buffer.from('hello world, not a backup at all ........................................') })).data.error, /not a backup/);
    const check = await send(c2, 'check', { password: 'backup-pass-123' });
    assert.equal(check.status, 200);
    assert.ok(check.data.summary.counts.assets >= 23 && check.data.summary.files >= 1);
    assert.equal((await send(c2, 'restore', { password: 'backup-pass-123' })).status, 400, 'needs the RESTORE confirmation');
    const restored = await send(c2, 'restore', { password: 'backup-pass-123', confirm: 'RESTORE' });
    assert.equal(restored.status, 200, JSON.stringify(restored.data));
    assert.ok(fs.existsSync(path.join(dir2, restored.data.safety_copy.replace(/^data\//, ''))) || fs.readdirSync(path.join(dir2, 'backups')).length === 1, 'safety copy kept');
    // Old PC2 sign-in no longer works; PC1's accounts do.
    assert.equal((await fetch(`${b2}/api/auth/me`, { headers: { Cookie: c2 } })).status, 401);
    const c2b = await login2('admin', 'admin123');
    const get2 = async (u) => (await fetch(`${b2}/api${u}`, { headers: { Cookie: c2b } })).json();
    const asset = await get2(`/assets/${made.id}`);
    assert.equal(asset.name, 'Only-on-PC1 Laptop');
    const photo = await fetch(`${b2}${asset.photo_url}`, { headers: { Cookie: c2b } });
    assert.equal(photo.status, 200, 'uploaded photo moved too');
    const secret = await (await fetch(`${b2}/api/vault/credentials/${cred.id}/secret`, { method: 'POST', headers: { Cookie: c2b, 'X-Requested-With': 'itms', 'Content-Type': 'application/json' }, body: '{"purpose":"reveal"}' })).json();
    assert.equal(secret.password, 'Moved#Across-PCs1', 'saved passwords re-locked with PC2 key');
    assert.notEqual(fs.readFileSync(path.join(dir2, 'vault.key'), 'utf8'), fs.readFileSync(path.join(tmp, 'vault.key'), 'utf8'), 'PC2 has its own key');
    const log = await get2('/activity?q=restored');
    assert.ok(log.some((l) => l.action === 'System restored from backup'));
  } finally {
    pc2.kill();
    fs.rmSync(dir2, { recursive: true, force: true });
  }
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

test('asset price: dashboard total value, value report, negative price rejected', async () => {
  const a = await login('admin', 'admin123');
  const cat = ok(await a.get('/settings/lookups')).categories.find((c) => c.prefix === 'MON').id;
  const before = ok(await a.get('/dashboard')).value;
  assert.ok(before.total > 0, 'sample assets have prices');
  assert.equal((await a.post('/assets', { name: 'Bad price', category_id: cat, purchase_cost: -5 })).status, 400);

  const m = ok(await a.post('/assets', { name: 'Priced Monitor', category_id: cat, purchase_cost: 12500.5 }));
  let v = ok(await a.get('/dashboard')).value;
  assert.equal(v.total, before.total + 12500.5);
  assert.equal(v.in_stock, before.in_stock + 12500.5);
  assert.equal(v.counted, before.counted + 1);
  ok(await a.post('/assets', { name: 'No price', category_id: cat }));
  v = ok(await a.get('/dashboard')).value;
  assert.equal(v.no_price, before.no_price + 1);

  ok(await a.put(`/assets/${m.id}`, { status: 'Retired' }));
  v = ok(await a.get('/dashboard')).value;
  assert.equal(v.total, before.total, 'retired assets are not counted');

  const rep = ok(await a.get('/reports/value'));
  const rows = rep.rows || rep;
  assert.ok(JSON.stringify(rows).includes('TOTAL'));
  const csv = await a.get('/reports/inventory?format=csv');
  assert.ok(csv.text.split('\n')[0].includes('Price'));
});

test('phone directory: add, edit, favourite, search, employees, export, permissions', async () => {
  const a = await login('admin', 'admin123');
  const list0 = ok(await a.get('/directory'));
  assert.ok(list0.contacts.length >= 10, 'sample contacts');
  assert.ok(list0.categories.includes('Vendor / Supplier'));

  assert.equal((await a.post('/directory', { name: 'No Number' })).status, 400);
  assert.equal((await a.post('/directory', { name: 'Bad', phone: 'call me maybe' })).status, 400);
  assert.equal((await a.post('/directory', { name: 'Bad', mobile: '0917', email: 'nope' })).status, 400);
  assert.equal((await a.post('/directory', { name: 'Bad', mobile: '0917', category: 'Aliens' })).status, 400);

  const c = ok(await a.post('/directory', { name: 'Zeta Printing Services', organization: 'Zeta Inc.', phone: '(02) 8555 0199', mobile: '+63 917 555 0100', category: 'Vendor / Supplier' }));
  assert.equal(c.is_favorite, 0);
  ok(await a.put(`/directory/${c.id}`, { is_favorite: true }));
  const fav = ok(await a.get('/directory')).contacts;
  assert.equal(fav[0].is_favorite, 1, 'favourites first');
  assert.equal(ok(await a.get('/directory?q=Zeta')).contacts.length, 1);
  assert.equal(ok(await a.get('/directory?q=8555 0199')).contacts[0].id, c.id);
  assert.ok(ok(await a.get('/directory?category=Vendor / Supplier')).contacts.every((x) => x.category === 'Vendor / Supplier'));
  assert.equal((await a.put(`/directory/${c.id}`, { phone: '', mobile: '' })).status, 400, 'must keep one number');

  const withEmp = ok(await a.get('/directory?include_employees=1')).contacts;
  assert.ok(withEmp.some((x) => x.source === 'employee'));
  assert.ok(ok(await a.get('/directory?category=Employees')).contacts.every((x) => x.source === 'employee'));

  const csv = await a.get('/directory/export?format=csv&q=Zeta');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-disposition'), /phone-directory-.*\.csv/);
  assert.ok(csv.text.includes('Zeta Printing Services') && csv.text.includes('(02) 8555 0199'));
  const xr = await fetch(`${base}/api/directory/export`, { headers: { Cookie: a.cookie } });
  assert.equal(xr.status, 200);
  const buf = Buffer.from(await xr.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString(), 'PK', 'xlsx file');
  const { readTable } = require('../server/lib/spreadsheet');
  const t = await readTable({ buffer: buf, originalname: 'd.xlsx' });
  assert.ok(JSON.stringify(t).includes('Zeta Printing Services'));

  // Viewer: can look and export, cannot change
  const v = await login('viewer', 'viewer123');
  ok(await v.get('/directory'));
  assert.equal((await v.get('/directory/export?format=csv')).status, 200);
  assert.equal((await v.post('/directory', { name: 'X', mobile: '0917 555 0000' })).status, 403);
  assert.equal((await v.del(`/directory/${c.id}`)).status, 403);

  ok(await a.del(`/directory/${c.id}`));
  assert.equal((await a.get('/directory?q=Zeta')).data.contacts.length, 0);
  const log = ok(await a.get('/activity?q=Contact'));
  assert.ok(log.some((l) => l.action === 'Contact added') && log.some((l) => l.action === 'Contact deleted'));
});

test('migration adds new permissions to an existing database', () => {
  const { migrate } = require('../server/lib/migrate');
  db.run("DELETE FROM role_permissions WHERE permission_key LIKE 'directory.%'");
  db.run("DELETE FROM permissions WHERE key LIKE 'directory.%'");
  migrate({ all: (s, ...p) => db.all(s, ...p), run: (s, ...p) => db.run(s, ...p) });
  const got = db.all(`SELECT r.name, p.key FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.key = rp.permission_key WHERE p.key LIKE 'directory.%'`);
  assert.ok(got.some((g) => g.name === 'Viewer' && g.key === 'directory.view'));
  assert.ok(!got.some((g) => g.name === 'Viewer' && g.key === 'directory.manage'));
  assert.ok(got.some((g) => g.name === 'IT Staff' && g.key === 'directory.manage'));
});

// A fresh install (empty data folder) as a separate server process.
async function freshServer() {
  const { spawn } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itms-new-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ['-r', path.join(__dirname, 'license-preload.js'), path.join(__dirname, '../server/index.js')], { env: { ...process.env, ITMS_TEST_LICENSE_PUB: TEST_PUB, PORT: String(port), ITMS_DATA_DIR: dir, ITMS_DB_FILE: path.join(dir, 'itms.db') }, stdio: 'pipe' });
  let out = '';
  await new Promise((resolve, reject) => { proc.stdout.on('data', (d) => { out += d; if (out.includes('running at')) setTimeout(resolve, 200); }); proc.on('exit', reject); setTimeout(() => reject(new Error('server did not start')), 20000); });
  const url = `http://127.0.0.1:${port}`;
  const post = (u, body, cookie) => fetch(`${url}/api${u}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'itms', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const get = async (u, cookie) => (await fetch(`${url}/api${u}`, { headers: cookie ? { Cookie: cookie } : {} })).json();
  return { url, out, post, get, stop: () => { proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('first-run setup: company and own admin account, no default passwords', async () => {
  const s = await freshServer();
  try {
    assert.match(s.out, /set up the system/);
    assert.doesNotMatch(s.out, /admin123/);
    assert.deepEqual(await s.get('/public/setup'), { needed: true });
    assert.equal((await fetch(`${s.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).status, 401, 'no default account');
    const good = { company_name: 'Acme Trading', full_name: 'Mark Reyes', username: 'Mark', password: 'my-secret-99', confirm: 'my-secret-99', license_key: testKey('Acme Trading') };
    const forged = makeKey(crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(16).toString('hex'), { company: 'Acme', expires: day(999) });
    for (const [field, value] of [['company_name', ''], ['full_name', ' '], ['username', 'a b'], ['password', 'short'], ['confirm', 'different-1'], ['license_key', ''], ['license_key', forged], ['license_key', testKey('Acme', -1)]]) {
      const r = await s.post('/public/setup', { ...good, [field]: value });
      assert.equal(r.status, 400, field);
    }
    const r = await s.post('/public/setup', good);
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie').split(';')[0];
    const me = await s.get('/auth/me', cookie);
    assert.equal(me.username, 'mark');
    assert.equal(me.role, 'Admin');
    assert.equal(me.company.name, 'Acme Trading');
    assert.deepEqual(me.features, { xlsx: true, pdf: true });
    const L = await s.get('/settings/lookups', cookie);
    assert.ok(L.categories.some((c) => c.prefix === 'LAP'), 'asset categories ready');
    assert.ok(L.departments.length > 0);
    assert.equal(L.locations.length, 0);
    assert.equal((await s.get('/dashboard', cookie)).assets.total, 0, 'starts empty');
    assert.deepEqual(await s.get('/public/setup'), { needed: false });
    assert.equal((await s.post('/public/setup', { ...good, username: 'intruder' })).status, 409, 'cannot run twice');
    const again = await fetch(`${s.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'mark', password: 'my-secret-99' }) });
    assert.equal(again.status, 200);
    const log = await s.get('/activity', cookie);
    assert.ok(log.some((l) => l.action === 'System set up'));
  } finally { s.stop(); }

  // With sample data: the examples load, but the sample accounts with known passwords are locked.
  const t = await freshServer();
  try {
    const r = await t.post('/public/setup', { company_name: 'Try Co', full_name: 'Tester', username: 'tester', password: 'tester-pass-1', sample_data: true, license_key: testKey('Try Co') });
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie').split(';')[0];
    const dash = await t.get('/dashboard', cookie);
    assert.ok(dash.assets.total > 0, 'sample assets loaded');
    assert.equal((await t.get('/auth/me', cookie)).company.name, 'Try Co');
    for (const [u, p] of [['admin', 'admin123'], ['itstaff', 'itstaff123'], ['viewer', 'viewer123']]) {
      const l = await fetch(`${t.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
      assert.equal(l.status, 401, `${u} locked`);
    }
  } finally { t.stop(); }
});

test('license key: status, renewal, lock when expired, backup still allowed', async () => {
  const a = await login('admin', 'admin123');
  const me = ok(await a.get('/auth/me'));
  assert.equal(me.license.state, 'valid');
  assert.equal(me.license.licensee, 'Pellas Corporation');
  const v = await login('viewer', 'viewer123');
  assert.equal((await v.post('/license', { key: testKey('X') })).status, 403, 'only admins enter keys');
  assert.equal((await a.post('/license', { key: 'ITMS1.garbage.key' })).status, 400);
  assert.equal((await a.post('/license', { key: testKey('Pellas Corporation', -3) })).status, 400, 'expired key refused');

  // Expiring soon → warning
  const soon = ok(await a.post('/license', { key: testKey('Pellas Corporation', 10) }));
  assert.equal(soon.state, 'valid'); assert.equal(soon.warn, true); assert.equal(soon.days_left, 10);

  // Expired (simulate time passing): the system locks, but sign-in, license and backup still work
  db.run("UPDATE settings SET value = ? WHERE key = 'license_key'", testKey('Pellas Corporation', -1));
  const locked = await a.get('/assets');
  assert.equal(locked.status, 402);
  assert.equal(locked.data.license, 'expired');
  assert.equal((await a.get('/auth/me')).status, 200);
  assert.equal(ok(await a.get('/license')).state, 'expired');
  const bk = await fetch(`${base}/api/backup/download`, { method: 'POST', headers: { Cookie: a.cookie, 'X-Requested-With': 'itms', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'backup-pass-123' }) });
  assert.equal(bk.status, 200, 'backup allowed while expired');
  assert.equal((await a.post('/directory', { name: 'x', mobile: '0917 555 0000' })).status, 402);

  // Renew → unlocked, logged
  const renewed = ok(await a.post('/license', { key: testKey('Pellas Corporation', 365) }));
  assert.equal(renewed.state, 'valid');
  assert.equal((await a.get('/assets')).status, 200);
  assert.ok(ok(await a.get('/activity?q=License')).some((l) => l.action === 'License key entered'));

  // Turning the clock back is noticed
  assert.equal(license.status(undefined, { today: day(400) }).state, 'expired');
  assert.equal(license.status(undefined, { today: day(0) }).state, 'clock');
  db.run("DELETE FROM settings WHERE key = 'license_last_seen'");
  assert.equal(license.status().state, 'valid');

  // Lifetime key: never expires, no reminder, and the computer's date doesn't matter
  const life = ok(await a.post('/license', { key: makeKey(TEST_PRIV, { company: 'Pellas Corporation', expires: 'never' }) }));
  assert.equal(life.state, 'valid'); assert.equal(life.lifetime, true); assert.equal(life.warn, false); assert.equal(life.days_left, null);
  assert.equal(license.status(undefined, { today: '2099-12-31' }).state, 'valid');
  assert.equal(license.status(undefined, { today: '2000-01-01' }).state, 'valid');
  assert.equal((await a.get('/assets')).status, 200);
  assert.throws(() => makeKey(TEST_PRIV, { company: 'X', expires: 'forever' }), /never/);
  db.run("DELETE FROM settings WHERE key = 'license_last_seen'");
});

// Keep this last: it erases the shared test database.
test('start fresh: erase data keeps the admin, roles and categories', async () => {
  const v = await login('viewer', 'viewer123');
  assert.equal((await v.post('/backup/erase', { password: 'viewer123', confirm: 'ERASE' })).status, 403);
  const a = await login('admin', 'admin123');
  const before = ok(await a.get('/backup/erase-preview'));
  assert.ok(before.assets > 0 && before.other_users > 0);
  assert.equal((await a.post('/backup/erase', { password: 'admin123', confirm: 'nope' })).status, 400);
  assert.equal((await a.post('/backup/erase', { password: 'wrong', confirm: 'ERASE' })).status, 400);
  assert.ok(ok(await a.get('/assets')).length > 0, 'nothing erased by failed attempts');

  const r = ok(await a.post('/backup/erase', { password: 'admin123', confirm: 'ERASE', departments: false }));
  assert.equal(r.erased.assets, before.assets);
  const after = ok(await a.get('/backup/erase-preview'));
  for (const k of ['assets', 'employees', 'ip_addresses', 'network_devices', 'isps', 'credentials', 'phone_contacts', 'locations', 'other_users']) assert.equal(after[k], 0, k);
  assert.ok(after.departments > 0, 'departments kept');
  const dash = ok(await a.get('/dashboard'));
  assert.equal(dash.assets.total, 0);
  assert.equal(dash.value.total, 0);
  assert.equal((await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'viewer', password: 'viewer123' }) })).status, 401, 'other users removed');
  const log = ok(await a.get('/activity'));
  assert.equal(log.length, 1);
  assert.equal(log[0].action, 'All data erased (start fresh)');

  // Works as a clean system afterwards: tags restart at 0001
  const L = ok(await a.get('/settings/lookups'));
  const cat = L.categories.find((c) => c.prefix === 'LAP');
  assert.ok(cat, 'categories kept');
  const made = ok(await a.post('/assets', { name: 'First real laptop', category_id: cat.id, purchase_cost: 45000 }));
  assert.match(made.asset_tag, /^LAP-0*1$/);
});
