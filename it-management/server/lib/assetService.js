// Asset create / update / deploy rules shared by the forms (routes/assets.js, routes/assignments.js)
// and the spreadsheet import, so every path validates and records history the same way.
const db = require('../db/connection');
const { log, history, today } = require('./activity');
const { bad, required, insert, update, diff } = require('./util');
const { nextTag } = require('./tags');
const { normalizeMac, MAC_RE } = require('./ip');

const STATUSES = ['Available', 'Deployed', 'Under Repair', 'Damaged', 'Lost', 'Retired', 'Disposed'];
const FIELDS = ['asset_tag', 'name', 'category_id', 'brand', 'model', 'serial_number', 'service_tag', 'description',
  'supplier', 'purchase_date', 'purchase_cost', 'po_number', 'invoice_number', 'department_id', 'location_id',
  'current_location', 'mac_address', 'connected_device_id', 'status', 'notes'];
const NUMERIC = ['category_id', 'purchase_cost', 'department_id', 'location_id', 'connected_device_id'];
const WARRANTY_FIELDS = ['warranty_start', 'warranty_end', 'warranty_provider'];

function validate(data, { creating }) {
  if (creating) required(data, { name: 'Asset name', category_id: 'Category' });
  if (data.status && !STATUSES.includes(data.status)) throw bad('Invalid status');
  if (data.mac_address) {
    if (!MAC_RE.test(data.mac_address)) throw bad('MAC address must look like AA:BB:CC:DD:EE:FF');
    data.mac_address = normalizeMac(data.mac_address);
  }
  if (data.asset_tag) data.asset_tag = data.asset_tag.toUpperCase();
}

// Checks for a new asset; fills in the tag and default status. Throws on invalid data.
function prepareCreate(data) {
  validate(data, { creating: true });
  if (!data.asset_tag) data.asset_tag = nextTag(data.category_id);
  if (db.get('SELECT 1 FROM assets WHERE asset_tag = ?', data.asset_tag)) throw bad(`Asset tag ${data.asset_tag} already exists`);
  if (data.status === 'Deployed') throw bad('Create the asset as Available, then use Deploy to assign it to an employee');
  data.status = data.status || 'Available';
  return data;
}

function createAsset(req, data, w = {}, { source } = {}) {
  prepareCreate(data);
  data.created_by = req.user.id;
  return db.tx(() => {
    const id = insert('assets', data);
    if (w.warranty_start || w.warranty_end) {
      insert('warranty_records', { asset_id: id, start_date: w.warranty_start || null, end_date: w.warranty_end || null, provider: w.warranty_provider || data.brand || null, is_primary: 1 });
    }
    if (data.purchase_date) history(req, id, 'Purchased', `Purchased${data.supplier ? ` from ${data.supplier}` : ''}`, data.purchase_date);
    history(req, id, 'Created', `Added to inventory as ${data.asset_tag} (${data.status})${source ? ` — ${source}` : ''}`, today());
    log(req, source ? 'Asset imported' : 'Asset created', 'asset', id, data.asset_tag, { name: data.name });
    return id;
  });
}

// Checks an update against the asset's current state. Returns the list of changed fields.
function prepareUpdate(old, data) {
  validate(data, { creating: false });
  if (data.asset_tag && data.asset_tag !== old.asset_tag && db.get('SELECT 1 FROM assets WHERE asset_tag = ?', data.asset_tag)) throw bad(`Asset tag ${data.asset_tag} already exists`);
  if (data.status && data.status !== old.status) {
    const active = db.get("SELECT 1 FROM asset_assignments WHERE asset_id = ? AND status = 'Active'", old.id);
    if (data.status === 'Deployed' && !active) throw bad('Use the Deploy workflow to assign the asset to an employee');
    if (active && data.status !== 'Deployed' && ['Available', 'Retired', 'Disposed'].includes(data.status)) throw bad('Asset is still assigned — return it first');
  }
  return diff(old, data);
}

function warrantyChanges(assetId, w) {
  if (!('warranty_start' in w || 'warranty_end' in w || 'warranty_provider' in w)) return false;
  const pw = db.get('SELECT * FROM warranty_records WHERE asset_id = ? AND is_primary = 1', assetId);
  if (!pw) return !!(w.warranty_start || w.warranty_end);
  return ['start', 'end'].some((k) => `warranty_${k}` in w && String(pw[`${k}_date`] ?? '') !== String(w[`warranty_${k}`] ?? ''))
    || (!!w.warranty_provider && w.warranty_provider !== pw.provider);
}

function updateAsset(req, old, data, w = {}, { source } = {}) {
  const changed = prepareUpdate(old, data);
  const warrantyChanged = warrantyChanges(old.id, w);
  db.tx(() => {
    update('assets', old.id, data);
    if (warrantyChanged) {
      const pw = db.get('SELECT * FROM warranty_records WHERE asset_id = ? AND is_primary = 1', old.id);
      if (pw) {
        const patch = {};
        if ('warranty_start' in w) patch.start_date = w.warranty_start ?? null;
        if ('warranty_end' in w) patch.end_date = w.warranty_end ?? null;
        if (w.warranty_provider) patch.provider = w.warranty_provider;
        update('warranty_records', pw.id, patch, { touch: false });
      } else insert('warranty_records', { asset_id: old.id, start_date: w.warranty_start || null, end_date: w.warranty_end || null, provider: w.warranty_provider || old.brand || null, is_primary: 1 });
    }
    if (data.status && data.status !== old.status) history(req, old.id, 'Status Changed', `Status changed from ${old.status} to ${data.status}`);
    const fields = [...changed.filter((c) => c !== 'status'), ...(warrantyChanged ? ['warranty'] : [])];
    if (changed.length || warrantyChanged) {
      history(req, old.id, 'Updated', `Details updated${source ? ` via ${source}` : ''} (${fields.join(', ') || 'status'})`);
      log(req, source ? 'Asset updated by import' : 'Asset edited', 'asset', old.id, data.asset_tag || old.asset_tag, { fields: [...changed, ...(warrantyChanged ? ['warranty'] : [])].join(', ') });
    }
  });
  return [...changed, ...(warrantyChanged ? ['warranty'] : [])];
}

// Checks a deployment. Returns the employee row. `asset` is a getAsset() row.
function prepareDeploy(asset, employee) {
  if (asset.assignment_id) throw bad(`${asset.asset_tag} is already assigned to ${asset.employee_name}. Use Transfer instead.`);
  if (asset.status !== 'Available') throw bad(`${asset.asset_tag} is ${asset.status} and cannot be deployed`);
  if (!employee) throw bad('Employee not found');
  if (employee.status !== 'Active') throw bad(`${employee.full_name} is ${employee.status}`);
  return employee;
}

function deployAsset(req, asset, employee, d = {}) {
  prepareDeploy(asset, employee);
  const row = {
    asset_id: asset.id, employee_id: employee.id,
    department_id: d.department_id || employee.department_id || null,
    location_id: d.location_id || employee.location_id || asset.location_id || null,
    assigned_date: d.assigned_date || today(), condition_on_assign: d.condition_on_assign || null,
    issued_by: d.issued_by || req.user.full_name, notes: d.notes || null, status: 'Active', created_by: req.user.id,
  };
  return db.tx(() => {
    const id = insert('asset_assignments', row);
    update('assets', asset.id, { status: 'Deployed', department_id: row.department_id, location_id: row.location_id });
    history(req, asset.id, 'Assigned', `Assigned to ${employee.full_name} (${employee.employee_code})${row.condition_on_assign ? ` — condition: ${row.condition_on_assign}` : ''}`, row.assigned_date);
    log(req, 'Asset assigned', 'asset', asset.id, asset.asset_tag, { to: employee.full_name });
    return id;
  });
}

module.exports = {
  STATUSES, FIELDS, NUMERIC, WARRANTY_FIELDS, validate, prepareCreate, createAsset, prepareUpdate, updateAsset, warrantyChanges, prepareDeploy, deployAsset,
};
