// Reusable asset workflow dialogs: deploy, return, transfer, maintenance, retire, IP assignment.
import { api, openModal, formHtml, readForm, formData, opt, loadLookups, invalidateLookups, toast, today, state, esc } from '../core.js';

export async function afterChange(msg) {
  if (msg) toast(msg);
  invalidateLookups();
  await loadLookups(true);
  window.dispatchEvent(new Event('itms:refresh'));
}

const assetLabel = (a) => `${a.asset_tag} — ${a.name}`;
const empLabel = (e) => `${e.full_name} (${e.employee_code})`;
export const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];

export async function deployModal({ assetId, employeeId } = {}) {
  const L = await loadLookups();
  const available = L.assets.filter((a) => a.status === 'Available' || String(a.id) === String(assetId));
  const employees = L.employees.filter((e) => e.status === 'Active');
  openModal({
    title: 'Deploy asset',
    size: 'lg',
    submitLabel: 'Deploy',
    body: `<p class="muted" style="margin-top:0">The asset becomes <b>DEPLOYED</b> and appears on the employee's profile immediately.</p>${formHtml([
      { type: 'section', label: '1 · Asset & employee' },
      { name: 'asset_id', label: 'Asset', type: 'select', required: true, options: opt(available, 'id', assetLabel), value: assetId, help: available.length ? '' : 'No available assets — return or add one first' },
      { name: 'employee_id', label: 'Employee', type: 'select', required: true, options: opt(employees, 'id', empLabel), value: employeeId },
      { name: 'department_id', label: 'Department', type: 'select', options: opt(L.departments), help: 'Defaults to the employee\'s department' },
      { name: 'location_id', label: 'Location', type: 'select', options: opt(L.locations), help: 'Defaults to the employee\'s office' },
      { type: 'section', label: '2 · Deployment details' },
      { name: 'assigned_date', label: 'Deployment date', type: 'date', value: today(), required: true },
      { name: 'condition_on_assign', label: 'Condition before deployment', type: 'select', options: opt(CONDITIONS), value: 'Good' },
      { name: 'issued_by', label: 'Issued by', value: state.user.full_name },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ])}`,
    onOpen: (form) => {
      const sync = () => {
        const e = L.employees.find((x) => String(x.id) === form.employee_id.value);
        if (e) { form.department_id.value = e.department_id || ''; form.location_id.value = e.location_id || ''; }
      };
      form.employee_id.addEventListener('change', sync);
      sync();
    },
    onSubmit: async (form) => {
      const r = await api.post('/assignments/deploy', readForm(form));
      await afterChange(`${r.asset.asset_tag} deployed to ${r.asset.employee_name}`);
    },
  });
}

export async function returnModal({ assetId, employeeId } = {}) {
  const deployed = await api.get(`/assignments?status=Active${employeeId ? `&employee_id=${employeeId}` : ''}`);
  openModal({
    title: 'Return asset',
    size: 'lg',
    submitLabel: 'Record return',
    body: formHtml([
      { name: 'asset_id', label: 'Asset', type: 'select', required: true, options: deployed.map((a) => ({ value: a.asset_id, label: `${a.asset_tag} — ${a.asset_name} (held by ${a.employee_name})` })), value: assetId, span: 2 },
      { name: 'employee', label: 'Employee', type: 'static', html: '<span data-emp class="muted">Select an asset</span>' },
      { name: 'return_date', label: 'Return date', type: 'date', value: today(), required: true },
      { name: 'condition_on_return', label: 'Condition upon return', type: 'select', options: opt(CONDITIONS), value: 'Good' },
      { name: 'resulting_status', label: 'Status after return', type: 'select', placeholder: false, options: opt(['Available', 'Damaged', 'Under Repair', 'Lost']), value: 'Available' },
      { name: 'received_by', label: 'Received by', value: state.user.full_name },
      { name: 'photo', label: 'Photo (optional)', type: 'file' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ]),
    onOpen: (form) => {
      const sync = () => {
        const a = deployed.find((x) => String(x.asset_id) === form.asset_id.value);
        form.querySelector('[data-emp]').innerHTML = a ? `<b>${esc(a.employee_name)}</b> <span class="muted">(${esc(a.employee_code)}) · since ${esc(a.assigned_date)}</span>` : '<span class="muted">Select an asset</span>';
      };
      form.asset_id.addEventListener('change', sync);
      form.condition_on_return.addEventListener('change', () => { if (form.condition_on_return.value === 'Damaged') form.resulting_status.value = 'Damaged'; });
      sync();
    },
    onSubmit: async (form) => {
      const r = await api.form('POST', '/assignments/return', formData(form));
      await afterChange(`${r.asset.asset_tag} returned — now ${r.asset.status}`);
    },
  });
}

export async function transferModal({ assetId } = {}) {
  const L = await loadLookups();
  const deployed = await api.get('/assignments?status=Active');
  openModal({
    title: 'Transfer asset',
    size: 'lg',
    submitLabel: 'Transfer',
    body: `<p class="muted" style="margin-top:0">The previous assignment is closed (kept in history) and a new one is opened for the receiving employee.</p>${formHtml([
      { name: 'asset_id', label: 'Asset', type: 'select', required: true, options: deployed.map((a) => ({ value: a.asset_id, label: `${a.asset_tag} — ${a.asset_name}` })), value: assetId, span: 2 },
      { name: 'from', label: 'From (current holder)', type: 'static', html: '<span data-from class="muted">—</span>' },
      { name: 'to_employee_id', label: 'To (new employee)', type: 'select', required: true, options: opt(L.employees.filter((e) => e.status === 'Active'), 'id', empLabel) },
      { name: 'transfer_date', label: 'Transfer date', type: 'date', value: today(), required: true },
      { name: 'approved_by', label: 'Approved by' },
      { name: 'reason', label: 'Reason', span: 2 },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ])}`,
    onOpen: (form) => {
      const sync = () => {
        const a = deployed.find((x) => String(x.asset_id) === form.asset_id.value);
        form.querySelector('[data-from]').innerHTML = a ? `<b>${esc(a.employee_name)}</b> <span class="muted">(${esc(a.employee_code)})</span>` : '—';
      };
      form.asset_id.addEventListener('change', sync);
      sync();
    },
    onSubmit: async (form) => {
      const r = await api.post('/assignments/transfer', readForm(form));
      await afterChange(`${r.asset.asset_tag} transferred to ${r.asset.employee_name}`);
    },
  });
}

export const MAINT_STATUSES = ['Reported', 'Diagnosis', 'Under Repair', 'Waiting for Parts', 'Completed', 'Unrepairable'];

export async function maintenanceModal({ assetId, record } = {}) {
  const L = await loadLookups();
  const assets = L.assets.filter((a) => !['Retired', 'Disposed'].includes(a.status) || String(a.id) === String(assetId || record?.asset_id));
  openModal({
    title: record ? `Maintenance — ${record.asset_tag}` : 'Log maintenance / repair',
    size: 'lg',
    body: `<p class="muted" style="margin-top:0">While a record is open (not Completed/Unrepairable) the asset status is <b>UNDER REPAIR</b>. Completing it restores Deployed/Available automatically.</p>${formHtml([
      record ? { name: 'asset', label: 'Asset', type: 'static', html: `<b>${esc(record.asset_tag)}</b> — ${esc(record.asset_name)}` }
        : { name: 'asset_id', label: 'Asset', type: 'select', required: true, options: opt(assets, 'id', assetLabel), value: assetId },
      { name: 'status', label: 'Status', type: 'select', placeholder: false, options: opt(MAINT_STATUSES), value: record?.status || 'Reported' },
      { name: 'issue', label: 'Issue', required: true, span: 2, value: record?.issue },
      { name: 'reported_date', label: 'Reported date', type: 'date', value: record?.reported_date || today() },
      { name: 'repair_start', label: 'Repair start', type: 'date', value: record?.repair_start },
      { name: 'repair_end', label: 'Repair end', type: 'date', value: record?.repair_end },
      { name: 'technician', label: 'Technician', value: record?.technician },
      { name: 'vendor', label: 'Vendor / service center', value: record?.vendor },
      { name: 'repair_cost', label: `Repair cost (${L.currency})`, type: 'number', step: '0.01', value: record?.repair_cost },
      { name: 'parts_replaced', label: 'Parts replaced', span: 2, value: record?.parts_replaced },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2, value: record?.notes },
    ])}`,
    onSubmit: async (form) => {
      const body = readForm(form);
      if (record) await api.put(`/maintenance/${record.id}`, body);
      else await api.post('/maintenance', body);
      await afterChange(record ? 'Maintenance record updated' : 'Maintenance logged');
    },
  });
}

export function retireModal(asset) {
  openModal({
    title: `Retire ${asset.asset_tag}`,
    danger: true,
    submitLabel: 'Retire asset',
    body: `<p>${esc(asset.name)} will be marked as retired/disposed. Its history is kept and any IP is released.</p>${formHtml([
      { name: 'status', label: 'New status', type: 'select', placeholder: false, options: opt(['Retired', 'Disposed']) },
      { name: 'date', label: 'Date', type: 'date', value: today() },
      { name: 'reason', label: 'Reason', span: 2, placeholder: 'e.g. End of life, beyond economical repair' },
    ])}`,
    onSubmit: async (form) => {
      await api.post(`/assets/${asset.id}/retire`, readForm(form));
      await afterChange(`${asset.asset_tag} retired`);
    },
  });
}

export async function ipModal({ ip, assetId, networkId } = {}) {
  const L = await loadLookups();
  const meta = await api.get('/network/meta');
  openModal({
    title: ip ? `Edit IP ${ip.address}` : 'Assign / add IP address',
    size: 'lg',
    body: formHtml([
      { name: 'network_id', label: 'Network', type: 'select', required: true, options: opt(L.networks, 'id', (n) => `${n.name} (${n.cidr})`), value: ip?.network_id || networkId },
      { name: 'address', label: 'IP address', required: true, value: ip?.address, placeholder: '192.168.1.25', help: 'Use “Next free” to pick the first unused static address' },
      { name: 'asset_id', label: 'Asset (device)', type: 'select', options: opt(L.assets.filter((a) => !['Retired', 'Disposed'].includes(a.status)), 'id', assetLabel), value: ip?.asset_id || assetId },
      { name: 'device_name', label: 'Device name (if not a tracked asset)', value: ip?.device_name },
      { name: 'hostname', label: 'Hostname', value: ip?.hostname },
      { name: 'mac_address', label: 'MAC address', value: ip?.mac_address, placeholder: 'AA:BB:CC:DD:EE:FF' },
      { name: 'ip_type', label: 'IP type', type: 'select', placeholder: false, options: opt(meta.ip_types), value: ip?.ip_type || 'Static' },
      { name: 'status', label: 'Status', type: 'select', options: opt(meta.ip_statuses), value: ip?.status, placeholder: 'Auto' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2, value: ip?.notes },
    ]) + '<div style="margin-top:10px"><button type="button" class="btn sm" data-next>Next free address</button></div>',
    onOpen: (form) => {
      form.querySelector('[data-next]').addEventListener('click', async () => {
        if (!form.network_id.value) { toast('Choose a network first', 'err'); return; }
        const r = await api.get(`/network/networks/${form.network_id.value}/next-ip`);
        if (r.address) form.address.value = r.address; else toast('No free static address in this network', 'err');
      });
    },
    onSubmit: async (form) => {
      const body = readForm(form);
      const r = ip ? await api.put(`/network/ips/${ip.id}`, body) : await api.post('/network/ips', body);
      if (r.warning) toast(r.warning, 'err');
      await afterChange(ip ? 'IP updated' : `IP ${r.address} saved`);
    },
  });
}

export async function uploadDocModal(entityType, entityId) {
  openModal({
    title: 'Upload document',
    body: formHtml([
      { name: 'doc_type', label: 'Document type', type: 'select', placeholder: false, options: opt(['Receipt', 'Invoice', 'Warranty', 'Photo', 'Contract', 'Manual', 'Other']) },
      { name: 'file', label: 'File (PDF, image, Office, max 15 MB)', type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.doc,.docx,.xls,.xlsx', span: 2 },
    ]),
    submitLabel: 'Upload',
    onSubmit: async (form) => {
      const fd = formData(form);
      fd.append('entity_type', entityType);
      fd.append('entity_id', entityId);
      await api.form('POST', '/documents', fd);
      await afterChange('Document uploaded');
    },
  });
}
