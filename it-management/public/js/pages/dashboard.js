import { api, esc, badge, fmtDate, timeAgo, fmtDateTime, can, setTitle, state, on } from '../core.js';
import { editNamesModal } from './branding.js';
import { icon } from '../icons.js';

// Categorical palette (validated, fixed order) — light / dark steps.
const PALETTE = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};
const charts = [];

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

const stat = (label, value, href, { sub, tone, dot } = {}) => `<a class="stat ${tone || ''}" href="${href}">
  <div class="label">${dot ? `<span class="dot" style="background:${dot}"></span>` : ''}${esc(label)}</div>
  <div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</a>`;

const ACT_ICON = { asset: 'box', employee: 'user', ip: 'hash', network: 'grid', device: 'router', isp: 'globe', credential: 'key', wifi: 'wifi', audit: 'clipboard', user: 'user', report: 'chart' };
const actHref = (a) => ({ asset: `#/assets/${a.entity_id}`, employee: `#/employees/${a.entity_id}`, network: `#/networks/${a.entity_id}`, device: `#/devices/${a.entity_id}`, audit: `#/audits/${a.entity_id}`, isp: '#/isps', ip: '#/ips', credential: '#/credentials', wifi: '#/wifi' }[a.entity_type] || null);

// Digital clock: updates every second and stops by itself once the dashboard is left.
function startClock(box) {
  if (!box) return;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const first = (state.user.full_name || '').split(' ')[0];
  const tick = () => {
    if (!box.isConnected) { clearInterval(timer); return; }
    const d = new Date();
    const h = d.getHours();
    box.querySelector('[data-hm]').textContent = `${String(h % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    box.querySelector('[data-s]').textContent = `:${String(d.getSeconds()).padStart(2, '0')}`;
    box.querySelector('[data-ap]').textContent = h < 12 ? 'AM' : 'PM';
    box.querySelector('[data-date]').textContent = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    box.querySelector('[data-greet]').textContent = `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${first}`;
  };
  const timer = setInterval(tick, 1000);
  tick();
}

export function activityItem(a) {
  const href = actHref(a);
  return `<li><div class="act-icon">${icon(ACT_ICON[a.entity_type] || 'activity')}</div><div class="grow">
    <div><b>${esc(a.user_name || 'System')}</b> · ${esc(a.action)}${a.entity_label ? ` — ${href ? `<a href="${href}">${esc(a.entity_label)}</a>` : esc(a.entity_label)}` : ''}</div>
    <div class="meta">${fmtDateTime(a.created_at)}</div></div><span class="meta nowrap">${timeAgo(a.created_at)}</span></li>`;
}

export async function render(el) {
  const C = state.company;
  setTitle(C.dashboard_title || 'Dashboard');
  charts.splice(0).forEach((c) => c.destroy());
  const d = await api.get('/dashboard');
  const pal = PALETTE[isDark() ? 'dark' : 'light'];
  const A = d.assets; const N = d.network; const E = d.employees; const L = d.alerts;
  const statusColors = { Available: pal[2], Deployed: pal[0], 'Under Repair': pal[3], Damaged: pal[1], Lost: pal[7], Retired: pal[6] };

  el.innerHTML = `
  <div class="dash-head">
    <div class="dash-intro">
      <div class="dash-title-row"><h1>${esc(C.dashboard_title)}</h1>${can('settings.manage') ? '<button type="button" class="icon-btn" data-edit-names title="Edit names" aria-label="Edit names">✎</button>' : ''}</div>
      ${C.dashboard_subtitle ? `<p>${esc(C.dashboard_subtitle)}</p>` : ''}
      <div class="page-actions">${can('assets.create') ? '<a class="btn primary" href="#/assets/new">+ Add Asset</a>' : ''}${can('assets.assign') ? '<a class="btn" href="#/deploy">Deploy Asset</a>' : ''}</div>
    </div>
    <div class="clock-card" data-clock aria-live="off">
      <div class="clock-time"><span data-hm>--:--</span><span class="clock-sec" data-s>:--</span><span class="clock-ampm" data-ap></span></div>
      <div class="clock-date" data-date></div>
      <div class="clock-greet" data-greet></div>
    </div>
  </div>

  <div class="section-title">${icon('box').replace('<svg', '<svg width="14" height="14"')} Assets</div>
  <div class="stats">
    ${stat('Total Assets', A.total, '#/assets')}
    ${stat('Available', A.Available, '#/assets?status=Available', { dot: statusColors.Available })}
    ${stat('Deployed', A.Deployed, '#/assets?status=Deployed', { dot: statusColors.Deployed })}
    ${stat('Under Repair', A['Under Repair'], '#/assets?status=Under%20Repair', { dot: statusColors['Under Repair'] })}
    ${stat('Damaged', A.Damaged, '#/assets?status=Damaged', { dot: statusColors.Damaged })}
    ${stat('Lost', A.Lost, '#/assets?status=Lost', { dot: statusColors.Lost })}
    ${stat('Retired', A.Retired + A.Disposed, '#/assets?status=Retired', { dot: statusColors.Retired, sub: A.Disposed ? `${A.Disposed} disposed` : '' })}
  </div>

  <div class="grid split-1-2">
    <div><div class="section-title">${icon('users').replace('<svg', '<svg width="14" height="14"')} Employees</div>
      <div class="stats" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
        ${stat('Total Employees', E.total, '#/employees')}
        ${stat('With Assets', E.with_assets, '#/employees?has_assets=1')}
        ${stat('Without Assets', E.without_assets, '#/employees?has_assets=0')}
      </div></div>
    <div><div class="section-title">${icon('globe').replace('<svg', '<svg width="14" height="14"')} Network Overview</div>
      <div class="stats" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
        ${stat('Total IP Addresses', N.total_ips, '#/ips', { sub: `${N.capacity} usable in ${N.subnets} subnets` })}
        ${stat('Active IPs', N.active_ips, '#/ips?status=Active')}
        ${stat('Available IPs', N.available_ips, '#/networks', { sub: 'free addresses' })}
        ${stat('Network Devices', N.devices, '#/devices')}
        ${stat('Active ISPs', N.active_isps, '#/isps')}
        ${stat('Backup ISPs', N.backup_isps, '#/isps')}
        ${stat('Offline / Inactive ISPs', N.inactive_isps, '#/isps', { tone: N.inactive_isps ? 'alert-on' : '' })}
        ${stat('Contract Expiring', N.contracts_expiring, '#/isps', { tone: N.contracts_expiring ? 'alert-on' : '', sub: `within ${L.contract_days} days` })}
      </div></div>
  </div>

  <div class="section-title">${icon('alert').replace('<svg', '<svg width="14" height="14"')} Alerts</div>
  <div class="stats">
    ${stat('Warranty Expiring Soon', L.warranty_expiring, '#/warranty?filter=expiring&days=' + L.warranty_days, { tone: L.warranty_expiring ? 'alert-on' : '', sub: `within ${L.warranty_days} days` })}
    ${stat('ISP Contract Expiring', L.contract_expiring, '#/isps', { tone: L.contract_expiring ? 'alert-on' : '', sub: `within ${L.contract_days} days` })}
    ${stat('Assets Under Repair', L.under_repair, '#/maintenance?status=active', { tone: L.under_repair ? 'alert-on' : '' })}
    ${stat('Missing Assets', L.missing, '#/assets?status=Lost', { tone: L.missing ? 'alert-bad' : '', sub: 'lost + missing in open audits' })}
    ${stat('IP Conflicts', L.ip_conflicts, '#/ips?status=Conflict', { tone: L.ip_conflicts ? 'alert-bad' : '' })}
    ${stat('Pending Inventory Audit', L.pending_audits, '#/audits', { tone: L.pending_audits ? 'alert-on' : '' })}
  </div>

  <div class="grid g2" style="margin-top:20px">
    <section class="card"><div class="card-head"><h3>Asset Status</h3><span class="muted">${A.total} total</span></div><div class="card-body"><div class="chart-box"><canvas id="chStatus"></canvas></div><div class="legend" id="lgStatus"></div></div></section>
    <section class="card"><div class="card-head"><h3>Asset Types</h3><span class="muted">active assets</span></div><div class="card-body"><div class="chart-box"><canvas id="chTypes"></canvas></div></div></section>
    <section class="card"><div class="card-head"><h3>Assets by Department</h3></div><div class="card-body"><div class="chart-box"><canvas id="chDept"></canvas></div></div></section>
    <section class="card"><div class="card-head"><h3>IP Utilization</h3><span class="muted">${N.capacity} usable addresses</span></div><div class="card-body"><div class="chart-box"><canvas id="chIp"></canvas></div><div class="legend" id="lgIp"></div></div></section>
  </div>

  <div class="grid g3" style="margin-top:16px">
    <section class="card"><div class="card-head"><h3>ISP Status</h3><a href="#/isps" class="muted">Manage</a></div>
      <div class="card-body flush">${d.isps.length ? d.isps.map((i) => `<div class="isp-row"><div class="act-icon">${icon('globe')}</div><div class="grow"><b>${esc(i.provider_name)}</b><div class="cell-sub">${esc(i.connection_name)}${i.speed ? ` · ${esc(i.speed)}` : ''}</div></div>
        <div style="text-align:right">${badge(i.role)} ${badge(i.status)}<div class="cell-sub" title="Status is updated manually">manual · ${timeAgo(i.status_updated_at)}</div></div></div>`).join('') : '<div class="empty-state">No ISPs yet</div>'}
      <div class="cell-sub" style="padding:8px 18px">Statuses are updated manually — live monitoring is not enabled yet.</div></div></section>
    <section class="card"><div class="card-head"><h3>Upcoming &amp; Open Items</h3></div><div class="card-body flush"><ul class="list">
      ${d.warranty_soon.map((w) => `<li><div class="act-icon" style="color:var(--amber);background:var(--amber-bg)">${icon('shield')}</div><div class="grow">Warranty for <a href="#/assets/${w.id}">${esc(w.asset_tag)}</a> expires in <b>${w.days_left} days</b><div class="meta">${esc(w.name)} · ${fmtDate(w.end_date)}</div></div></li>`).join('')}
      ${d.contract_soon.map((c) => `<li><div class="act-icon" style="color:var(--amber);background:var(--amber-bg)">${icon('globe')}</div><div class="grow">${esc(c.provider_name)} contract expires in <b>${c.days_left} days</b><div class="meta">${fmtDate(c.contract_end)}</div></div></li>`).join('')}
      ${d.repairs.map((m) => `<li><div class="act-icon" style="color:var(--orange);background:var(--orange-bg)">${icon('wrench')}</div><div class="grow"><a href="#/assets/${m.asset_id}">${esc(m.asset_tag)}</a> — ${esc(m.issue)}<div class="meta">Reported ${fmtDate(m.reported_date)}</div></div>${badge(m.status)}</li>`).join('')}
      ${!d.warranty_soon.length && !d.contract_soon.length && !d.repairs.length ? '<li class="muted">Nothing needs attention 🎉</li>' : ''}
    </ul></div></section>
    <section class="card"><div class="card-head"><h3>Recent Activity</h3>${can('activity.view') ? '<a href="#/activity" class="muted">View all</a>' : ''}</div>
      <div class="card-body flush"><ul class="list">${d.recent_activity.length ? d.recent_activity.map(activityItem).join('') : '<li class="muted">No activity visible for your role</li>'}</ul></div></section>
  </div>`;

  startClock(el.querySelector('[data-clock]'));
  on(el, 'click', '[data-edit-names]', () => editNamesModal());

  if (!window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const surface = css.getPropertyValue('--surface').trim();
  const text2 = css.getPropertyValue('--text-2').trim();
  const grid = css.getPropertyValue('--border').trim();
  Chart.defaults.color = text2;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const base = { responsive: true, maintainAspectRatio: false, animation: { duration: 300 } };
  const bar = (canvas, rows, horizontal) => charts.push(new Chart(canvas, {
    type: 'bar',
    data: { labels: rows.map((r) => r.label), datasets: [{ label: 'Assets', data: rows.map((r) => r.value), backgroundColor: pal[0], borderRadius: 4, maxBarThickness: 28 }] },
    options: { ...base, indexAxis: horizontal ? 'y' : 'x', plugins: { legend: { display: false } },
      scales: { x: { grid: { display: horizontal, color: grid }, ticks: { precision: 0 } }, y: { grid: { display: !horizontal, color: grid }, ticks: { precision: 0 } } } },
  }));
  const donut = (canvas, legendEl, rows, colors, onClick) => {
    const total = rows.reduce((s, r) => s + r.value, 0);
    charts.push(new Chart(canvas, {
      type: 'doughnut',
      data: { labels: rows.map((r) => r.label), datasets: [{ data: rows.map((r) => r.value), backgroundColor: colors, borderColor: surface, borderWidth: 2, hoverOffset: 4 }] },
      options: { ...base, cutout: '64%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed} (${total ? Math.round((c.parsed / total) * 100) : 0}%)` } } },
        onClick: onClick ? (_e, els) => { if (els[0]) onClick(rows[els[0].index]); } : undefined },
    }));
    legendEl.innerHTML = rows.map((r, i) => `<span><i style="background:${colors[i]}"></i>${esc(r.label)} <b>${r.value}</b></span>`).join('');
  };
  donut(el.querySelector('#chStatus'), el.querySelector('#lgStatus'), d.charts.status, d.charts.status.map((s) => statusColors[s.label]), (r) => { location.hash = `#/assets?status=${encodeURIComponent(r.label)}`; });
  bar(el.querySelector('#chTypes'), d.charts.types, false);
  bar(el.querySelector('#chDept'), d.charts.departments, true);
  donut(el.querySelector('#chIp'), el.querySelector('#lgIp'), d.charts.ip, [pal[0], pal[2], pal[6]]);
}
