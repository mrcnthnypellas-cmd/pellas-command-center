import { ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, ClipboardCheck, FileClock, FileText, FolderKanban, Inbox, MessagesSquare, Sparkles, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart, GOLD, HBarList, LineChart, SegmentBar, SERIES, Sparkline } from '../components/charts';
import { Avatar, Card, CardHeader, PageHeader, Progress, StatusBadge } from '../components/ui';
import { projectProgress } from '../lib/actions';
import { ACTIVE_PROJECT, conversionRate, monthlyCounts, monthlySum, revenueDate, serviceDemand } from '../lib/metrics';
import { scopeAppointments, scopeConversations, scopeInquiries, scopeProjects } from '../lib/permissions';
import { useSession, useStore } from '../lib/store';
import { PROJECT_STATUSES } from '../lib/types';
import { compactMoney, fmtDate, fmtTime, money, timeAgo, todayYMD } from '../lib/utils';
import { customerOf, isMgmt } from './shared';

function Kpi({ label, value, icon, to, sub, spark, accent }: { label: string; value: ReactNode; icon: ReactNode; to: string; sub?: ReactNode; spark?: number[]; accent?: boolean }) {
  return (
    <Link to={to} className={`group relative overflow-hidden rounded-2xl border p-4 transition hover:-translate-y-0.5 ${accent ? 'border-gold-400/30 bg-gradient-to-br from-gold-400/[0.12] to-navy-850/80' : 'border-white/[0.07] bg-navy-850/80 hover:border-white/15'}`}>
      <div className="flex items-start justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04] text-gold-300">{icon}</span>
        <ArrowUpRight className="h-4 w-4 text-slate-600 transition group-hover:text-gold-300" />
      </div>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="font-display text-[26px] font-semibold leading-none text-white">{value}</p>
        {spark && <Sparkline values={spark} />}
      </div>
      {sub && <p className="mt-2 text-xs text-slate-500">{sub}</p>}
    </Link>
  );
}

export default function Dashboard() {
  const { db } = useStore();
  const { user } = useSession();
  const nav = useNavigate();
  if (!user) return null;
  const mgmt = isMgmt(user);
  const inquiries = scopeInquiries(db, user);
  const projects = scopeProjects(db, user);
  const appts = scopeAppointments(db, user);
  const convs = scopeConversations(db, user);
  const sym = db.settings.currencySymbol;
  const today = todayYMD();

  const monthly = monthlyCounts(inquiries, (i) => i.createdAt);
  const newInq = inquiries.filter((i) => i.status === 'New');
  const activeConv = convs.filter((c) => c.status === 'Open' || c.status === 'Pending');
  const pendingQ = db.quotations.filter((q) => ['Draft', 'Sent', 'Viewed'].includes(q.status));
  const approvedQ = db.quotations.filter((q) => q.status === 'Approved');
  const activeP = projects.filter((p) => ACTIVE_PROJECT.includes(p.status));
  const completedP = projects.filter((p) => p.status === 'Completed');
  const upcoming = appts.filter((a) => a.date >= today && ['Pending', 'Confirmed', 'Rescheduled'].includes(a.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const revenue = monthlySum(db.projects, revenueDate, (p) => p.recordedRevenue);
  const conv12 = conversionRate(inquiries.filter((i) => new Date(i.createdAt) > new Date(Date.now() - 365 * 864e5)));
  const convByMonth = monthlyCounts(inquiries, (i) => i.createdAt).map((m) => {
    const rows = inquiries.filter((i) => i.createdAt.startsWith(m.key));
    return rows.length ? (rows.filter((i) => ['Approved', 'In Progress', 'Completed'].includes(i.status)).length / rows.length) * 100 : 0;
  });
  const apptMonthly = monthlyCounts(appts.filter((a) => a.status !== 'Cancelled'), (a) => `${a.date}T12:00:00`, 6);
  const statusDist = PROJECT_STATUSES.map((s, i) => ({ label: s, value: projects.filter((p) => p.status === s).length, color: SERIES[i]! }));
  const thisMonthRev = revenue[revenue.length - 1]?.value ?? 0;
  const ytd = revenue.reduce((n, r) => n + r.value, 0);
  const hour = new Date().getHours();

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        title={`Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`}
        subtitle={user.role === 'staff' ? 'Here’s the work assigned to you.' : `You have ${newInq.length} new inquiries, ${activeConv.reduce((n, c) => n + c.adminUnread, 0)} unread messages and ${upcoming.filter((a) => a.status === 'Pending').length} bookings to confirm.`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi accent label="Total inquiries" value={inquiries.length} icon={<Inbox className="h-4 w-4" />} to="/admin/inquiries" spark={monthly.map((m) => m.value)} sub={`${monthly[monthly.length - 1]?.value ?? 0} this month`} />
        <Kpi label="New inquiries" value={newInq.length} icon={<Sparkles className="h-4 w-4" />} to="/admin/inquiries?status=New" sub="Awaiting first response" />
        {mgmt && <Kpi label="Total customers" value={db.customers.filter((c) => !c.archived).length} icon={<Users className="h-4 w-4" />} to="/admin/customers" sub={`${db.customers.filter((c) => c.registeredAt.slice(0, 7) === today.slice(0, 7)).length} new this month`} />}
        <Kpi label="Active conversations" value={activeConv.length} icon={<MessagesSquare className="h-4 w-4" />} to="/admin/chat" sub={`${activeConv.reduce((n, c) => n + c.adminUnread, 0)} unread messages`} />
        {mgmt && <Kpi label="Pending quotations" value={pendingQ.length} icon={<FileClock className="h-4 w-4" />} to="/admin/quotations" sub={`${pendingQ.filter((q) => q.status === 'Draft').length} drafts · ${pendingQ.filter((q) => q.status !== 'Draft').length} awaiting reply`} />}
        {mgmt && <Kpi label="Approved quotations" value={approvedQ.length} icon={<ClipboardCheck className="h-4 w-4" />} to="/admin/quotations?status=Approved" sub={`${approvedQ.filter((q) => !q.projectId).length} not yet converted`} />}
        <Kpi label="Active projects" value={activeP.length} icon={<FolderKanban className="h-4 w-4" />} to="/admin/projects" sub={`${activeP.filter((p) => p.status === 'In Progress').length} in progress`} />
        <Kpi label="Completed projects" value={completedP.length} icon={<CheckCircle2 className="h-4 w-4" />} to="/admin/projects?status=Completed" sub="All time" />
        <Kpi label="Upcoming appointments" value={upcoming.length} icon={<CalendarDays className="h-4 w-4" />} to="/admin/appointments" sub={upcoming[0] ? `Next: ${fmtDate(upcoming[0].date, { month: 'short', day: 'numeric' })}, ${fmtTime(upcoming[0].time)}` : 'None scheduled'} />
        {mgmt && <Kpi label="Recorded revenue · this month" value={compactMoney(thisMonthRev, sym)} icon={<FileText className="h-4 w-4" />} to="/admin/reports" sub={`${compactMoney(ytd, sym)} in last 12 months`} />}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Monthly inquiries" subtitle="All channels · last 12 months" action={<Link to="/admin/reports" className="text-xs text-gold-200 hover:underline">Reports</Link>} />
          <div className="p-5">
            <BarChart data={monthly} ariaLabel="Monthly inquiries, last 12 months" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Inquiry conversion rate" subtitle="Inquiries that became approved work · 12 months" />
          <div className="p-5">
            <p className="font-display text-5xl font-semibold text-white">
              {conv12}
              <span className="text-2xl text-slate-500">%</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {inquiries.filter((i) => ['Approved', 'In Progress', 'Completed'].includes(i.status)).length} won of {inquiries.length} inquiries
            </p>
            <div className="mt-6">
              <LineChart labels={monthly.map((m) => m.label)} series={[{ name: 'Conversion', values: convByMonth.map((v) => Math.round(v)), color: GOLD, area: true }]} height={150} format={(v) => `${Math.round(v)}%`} ariaLabel="Conversion rate by month" />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {mgmt && (
          <Card className="xl:col-span-2">
            <CardHeader title="Monthly recorded revenue" subtitle="Payments recorded on projects — excludes unapproved quotation amounts" />
            <div className="p-5">
              <LineChart labels={revenue.map((r) => r.label)} series={[{ name: 'Recorded revenue', values: revenue.map((r) => r.value), color: GOLD, area: true }]} format={(v) => compactMoney(v, sym)} ariaLabel="Monthly recorded revenue" />
            </div>
          </Card>
        )}
        <Card className={mgmt ? '' : 'xl:col-span-2'}>
          <CardHeader title="Most requested services" subtitle="Share of all inquiries" />
          <div className="p-5">
            <HBarList data={serviceDemand(db, inquiries).map((d) => ({ ...d, sub: `${Math.round((d.value / Math.max(1, inquiries.length)) * 100)}%` }))} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Project status distribution" subtitle={`${projects.length} projects`} />
          <div className="p-5">
            <SegmentBar data={statusDist} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Appointment activity" subtitle="Scheduled per month (excl. cancelled)" />
          <div className="p-5">
            <BarChart data={apptMonthly} height={190} ariaLabel="Appointments per month" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Upcoming appointments" action={<Link to="/admin/appointments" className="text-xs text-gold-200 hover:underline">Calendar</Link>} />
          <ul className="divide-y divide-white/[0.05]">
            {upcoming.slice(0, 5).map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => nav(`/admin/appointments?a=${a.id}`)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-white/[0.03]">
                  <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-white/[0.07] bg-white/[0.03] py-1">
                    <span className="text-[9px] uppercase text-gold-300">{fmtDate(a.date, { month: 'short' })}</span>
                    <span className="font-display text-lg font-semibold leading-none text-white">{a.date.slice(8)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-200">{a.type}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {fmtTime(a.time)} · {a.name}
                    </span>
                  </span>
                  <StatusBadge status={a.status} />
                </button>
              </li>
            ))}
            {!upcoming.length && <li className="px-5 py-8 text-center text-sm text-slate-500">No upcoming appointments.</li>}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Latest inquiries" action={<Link to="/admin/inquiries" className="flex items-center gap-1 text-xs text-gold-200 hover:underline">View all <ArrowRight className="h-3 w-3" /></Link>} />
          <ul className="divide-y divide-white/[0.05]">
            {[...inquiries]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 6)
              .map((i) => (
                <li key={i.id}>
                  <Link to={`/admin/inquiries/${i.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03]">
                    <Avatar name={i.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-200">{i.title}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {i.ref} · {i.name} · {i.service}
                      </span>
                    </span>
                    <span className="hidden text-xs text-slate-500 sm:block">{timeAgo(i.createdAt)}</span>
                    <StatusBadge status={i.status} />
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Active projects" action={<Link to="/admin/projects" className="text-xs text-gold-200 hover:underline">All projects</Link>} />
          <ul className="divide-y divide-white/[0.05]">
            {activeP
              .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
              .slice(0, 5)
              .map((p) => (
                <li key={p.id}>
                  <Link to={`/admin/projects/${p.id}`} className="block px-5 py-3 hover:bg-white/[0.03]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-slate-200">{p.name}</span>
                      <span className="text-xs tabular-nums text-gold-200">{projectProgress(p)}%</span>
                    </div>
                    <p className="mb-2 truncate text-xs text-slate-500">
                      {customerOf(db, p.customerId)?.company || customerOf(db, p.customerId)?.name} · due {fmtDate(p.targetDate)}
                    </p>
                    <Progress value={projectProgress(p)} size="sm" />
                  </Link>
                </li>
              ))}
            {!activeP.length && <li className="px-5 py-8 text-center text-sm text-slate-500">No active projects.</li>}
          </ul>
          {mgmt && (
            <div className="border-t border-white/[0.05] px-5 py-3 text-xs text-slate-500">
              Budget in active projects: <span className="text-slate-300">{money(activeP.reduce((n, p) => n + p.budget, 0), sym, 0)}</span>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
