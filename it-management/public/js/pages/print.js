import { api, esc, fmtDate, setTitle, state, loadLookups } from '../core.js';

export async function accountability(el, [id]) {
  const [e, company] = await Promise.all([api.get(`/employees/${id}`), api.get('/settings/company')]);
  setTitle(`Accountability — ${e.full_name}`);
  el.innerHTML = `<div class="print-toolbar"><a class="btn" href="#/employees/${e.id}">← Back</a><button class="btn primary" data-print>Print / Save as PDF</button></div>
  <div class="card print-page">
    <div class="company">${company.company_logo_url ? `<img src="${esc(company.company_logo_url)}" alt="" style="max-height:48px"><br>` : ''}<b style="font-size:16px">${esc(company.company_name || '')}</b><br>
      <span style="font-size:12px">${esc(company.company_address || '')}${company.company_phone ? ` · ${esc(company.company_phone)}` : ''}${company.company_email ? ` · ${esc(company.company_email)}` : ''}</span></div>
    <h1>EMPLOYEE ASSET ACKNOWLEDGEMENT</h1>
    <table style="margin-top:18px"><tbody>
      <tr><th style="width:22%">Employee</th><td>${esc(e.full_name)}</td><th style="width:18%">Employee ID</th><td>${esc(e.employee_code)}</td></tr>
      <tr><th>Department</th><td>${esc(e.department || '')}</td><th>Position</th><td>${esc(e.position || '')}</td></tr>
      <tr><th>Office / Location</th><td>${esc(e.location || '')}</td><th>Date</th><td>${fmtDate(new Date().toISOString().slice(0, 10), true)}</td></tr>
    </tbody></table>
    <p style="margin:18px 0 6px"><b>Assigned Assets</b> (${e.assets.length})</p>
    <table><thead><tr><th>#</th><th>Category</th><th>Asset</th><th>Asset Tag</th><th>Serial Number</th><th>Date Issued</th><th>Condition</th></tr></thead><tbody>
      ${e.assets.map((a, i) => { const asg = e.assignment_history.find((h) => h.asset_id === a.id && h.status === 'Active'); return `<tr><td>${i + 1}</td><td>${esc(a.category)}</td><td>${esc(a.name)}</td><td><b>${esc(a.asset_tag)}</b></td><td>${esc(a.serial_number || '')}</td><td>${fmtDate(a.assigned_date)}</td><td>${esc(asg?.condition_on_assign || '')}</td></tr>`; }).join('')
      || '<tr><td colspan="7" style="text-align:center">No assets currently assigned</td></tr>'}
    </tbody></table>
    <p style="font-size:12px;line-height:1.6;margin-top:14px">I acknowledge receipt of the company equipment listed above in the stated condition. I agree to use it for official business, take reasonable care of it,
      report loss or damage to IT/Admin immediately, and return all items upon request or at the end of my employment. I understand I may be held accountable for loss or damage caused by negligence.</p>
    <div class="sig-row"><div>Employee Signature over Printed Name<br><b>${esc(e.full_name)}</b></div><div>IT / Admin Signature over Printed Name<br><b>${esc(state.user.full_name)}</b></div></div>
    <div class="sig-row" style="margin-top:40px"><div>Date</div><div>Date</div></div>
  </div>`;
  el.querySelector('[data-print]').addEventListener('click', () => window.print());
}

export async function labels(el, _m, params) {
  const L = await loadLookups();
  const ids = params.ids ? params.ids.split(',') : null;
  const assets = L.assets.filter((a) => (ids ? ids.includes(String(a.id)) : !['Retired', 'Disposed'].includes(a.status)));
  setTitle('QR labels');
  const company = state.company?.name || '';
  el.innerHTML = `<div class="print-toolbar" style="max-width:none"><a class="btn" href="#/assets">← Assets</a><button class="btn primary" data-print>Print labels</button></div>
    <div class="card" style="padding:16px"><p class="muted no-print" style="margin-top:0">Each QR code opens the asset profile (sign-in required). Credentials are never encoded.</p>
    <div class="labels">${assets.map((a) => `<div class="label-card"><img src="/api/assets/${a.id}/qr.svg?origin=${encodeURIComponent(location.origin)}" alt="">
      <div><small>${esc(company)}</small><b class="mono">${esc(a.asset_tag)}</b><span style="font-size:12px">${esc(a.name)}</span><br><small>Property of ${esc(company)} IT</small></div></div>`).join('')}</div></div>`;
  el.querySelector('[data-print]').addEventListener('click', () => window.print());
}
