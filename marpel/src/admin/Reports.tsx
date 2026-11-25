import { Download, Info, Printer } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { BarChart, GroupedBars, HBarList, Legend, LineChart, SegmentBar, SERIES, GOLD } from '../components/charts';
import { Button, Card, CardHeader, Input, PageHeader, Select, Table, Td, Th } from '../components/ui';
import { actorOf, audit } from '../lib/actions';
import { inRange, revenueDate, WON } from '../lib/metrics';
import { useSession, useStore } from '../lib/store';
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES } from '../lib/types';
import { compactMoney, downloadCSV, money, pad, quoteTotals, todayYMD } from '../lib/utils';

type Preset = '30d' | '90d' | '6m' | '12m' | 'ytd' | 'custom';

function monthsBetween(from: Date, to: Date) {
  const out: { key: string; label: string }[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  while (d <= to) {
    out.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}`, label: d.toLocaleDateString('en-US', { month: 'short' }) + (from.getFullYear() !== to.getFullYear() && d.getMonth() === 0 ? ` ’${String(d.getFullYear()).slice(2)}` : '') });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

function Section({ title, subtitle, children, onExport, className }: { title: string; subtitle?: ReactNode; children: ReactNode; onExport?: () => void; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          onExport && (
            <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={onExport} className="no-print">
              CSV
            </Button>
          )
        }
      />
      <div className="p-5">{children}</div>
    </Card>
  );
}

export default function Reports() {
  const { db, update } = useStore();
  const { user } = useSession();
  const [preset, setPreset] = useState<Preset>('12m');
  const [from, setFrom] = useState(() => todayYMD(new Date(Date.now() - 365 * 864e5)));
  const [to, setTo] = useState(todayYMD());
  const [service, setService] = useState('');
  const sym = db.settings.currencySymbol;

  const range = useMemo(() => {
    const now = new Date();
    const end = preset === 'custom' ? new Date(to + 'T23:59:59') : now;
    let start: Date;
    if (preset === '30d') start = new Date(now.getTime() - 30 * 864e5);
    else if (preset === '90d') start = new Date(now.getTime() - 90 * 864e5);
    else if (preset === '6m') start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    else if (preset === '12m') start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    else if (preset === 'ytd') start = new Date(now.getFullYear(), 0, 1);
    else start = new Date(from + 'T00:00:00');
    return { start, end };
  }, [preset, from, to]);

  const months = monthsBetween(range.start, range.end);
  const inR = (iso?: string) => !!iso && inRange(iso.length === 10 ? iso + 'T12:00:00' : iso, range.start, range.end);
  const bySvc = <T extends { service?: string; serviceCategory?: string; category?: string }>(x: T) => !service || (x.service ?? x.serviceCategory ?? x.category) === service;
  const perMonth = <T,>(rows: T[], date: (r: T) => string | undefined, val: (r: T) => number = () => 1) => {
    const m = new Map(months.map((x) => [x.key, 0]));
    rows.forEach((r) => {
      const d = date(r);
      if (!d) return;
      const k = d.slice(0, 7);
      if (m.has(k)) m.set(k, m.get(k)! + val(r));
    });
    return months.map((x) => Math.round(m.get(x.key)!));
  };

  const inquiries = db.inquiries.filter((i) => inR(i.createdAt) && bySvc(i));
  const customers = db.customers.filter((c) => inR(c.registeredAt));
  const quotes = db.quotations.filter((q) => inR(q.issuedAt) && bySvc(q));
  const appts = db.appointments.filter((a) => inR(a.date));
  const completed = db.projects.filter((p) => p.status === 'Completed' && inR(p.completedDate) && bySvc(p));
  const revProjects = db.projects.filter((p) => inR(revenueDate(p)) && bySvc(p));

  const inqMonthly = perMonth(inquiries, (i) => i.createdAt);
  const custMonthly = perMonth(customers, (c) => c.registeredAt);
  const revenue = perMonth(revProjects, revenueDate, (p) => p.recordedRevenue);
  const projected = perMonth(quotes.filter((q) => ['Sent', 'Viewed', 'Approved'].includes(q.status)), (q) => q.issuedAt, (q) => quoteTotals(q).total);
  const approvedQ = perMonth(quotes.filter((q) => q.status === 'Approved'), (q) => q.issuedAt, (q) => quoteTotals(q).total);
  const completedMonthly = perMonth(completed, (p) => p.completedDate);
  const totalRevenue = revProjects.reduce((n, p) => n + p.recordedRevenue, 0);
  const pipeline = quotes.filter((q) => q.status === 'Sent' || q.status === 'Viewed').reduce((n, q) => n + quoteTotals(q).total, 0);
  const won = inquiries.filter((i) => WON.includes(i.status)).length;
  const onTime = completed.filter((p) => (p.completedDate ?? '') <= p.targetDate).length;

  const demand = db.services.map((s) => ({ label: s.name, value: inquiries.filter((i) => i.service === s.name).length })).sort((a, b) => b.value - a.value);
  const funnel = [
    { label: 'Inquiries received', value: inquiries.length },
    { label: 'Quotations issued', value: quotes.length },
    { label: 'Quotations approved', value: quotes.filter((q) => q.status === 'Approved').length },
    { label: 'Projects completed', value: completed.length },
  ];
  const topCustomers = db.customers
    .map((c) => ({ c, inq: inquiries.filter((i) => i.customerId === c.id).length, rev: revProjects.filter((p) => p.customerId === c.id).reduce((n, p) => n + p.recordedRevenue, 0) }))
    .filter((x) => x.inq || x.rev)
    .sort((a, b) => b.rev - a.rev || b.inq - a.inq)
    .slice(0, 10);

  const logExport = (name: string) => update((d) => audit(d, actorOf(user), 'Exported report', name));
  const csv = (name: string, rows: (string | number)[][]) => {
    downloadCSV(`marpel-${name}-${todayYMD()}.csv`, rows);
    logExport(name);
  };

  return (
    <>
      <PageHeader
        title="Reports & analytics"
        subtitle="Business performance across inquiries, sales, delivery and revenue."
        actions={
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => (logExport('PDF (print)'), window.print())} className="no-print">
            Export PDF
          </Button>
        }
      />
      <Card className="no-print mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.07] bg-navy-900/60 p-1">
          {(
            [
              ['30d', 'Last 30 days'],
              ['90d', 'Last 90 days'],
              ['6m', '6 months'],
              ['12m', '12 months'],
              ['ytd', 'Year to date'],
              ['custom', 'Custom'],
            ] as [Preset, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPreset(k)} className={`rounded-lg px-3 py-1.5 text-xs ${preset === k ? 'bg-gold-400/15 text-gold-100 ring-1 ring-gold-400/30' : 'text-slate-400 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From" />
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To" />
          </>
        )}
        <Select value={service} onChange={(e) => setService(e.target.value)} className="w-64" aria-label="Service category">
          <option value="">All service categories</option>
          {db.services.map((s) => (
            <option key={s.id}>{s.name}</option>
          ))}
        </Select>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Inquiries', inquiries.length.toString()],
          ['New customers', customers.length.toString()],
          ['Inquiry → won', `${inquiries.length ? Math.round((won / inquiries.length) * 100) : 0}%`],
          ['Recorded revenue', compactMoney(totalRevenue, sym)],
          ['Open quotation pipeline', compactMoney(pipeline, sym)],
        ].map(([l, v], i) => (
          <Card key={l} className={`p-4 ${i === 4 ? 'border-dashed' : ''}`}>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">{l}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-white">{v}</p>
            {i === 4 && <p className="text-[10px] text-slate-500">Projected · not revenue</p>}
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Monthly inquiries" subtitle={service || 'All services'} onExport={() => csv('monthly-inquiries', [['Month', 'Inquiries'], ...months.map((m, i) => [m.key, inqMonthly[i]!])])}>
          <BarChart data={months.map((m, i) => ({ label: m.label, value: inqMonthly[i]! }))} ariaLabel="Monthly inquiries" />
        </Section>
        <Section title="Customer acquisition" subtitle="New customer records per month" onExport={() => csv('customer-acquisition', [['Month', 'New customers'], ...months.map((m, i) => [m.key, custMonthly[i]!])])}>
          <BarChart data={months.map((m, i) => ({ label: m.label, value: custMonthly[i]! }))} color={SERIES[0]} ariaLabel="New customers per month" />
        </Section>

        <Section
          title="Recorded project revenue"
          subtitle="Money recorded on projects (payments received). Attributed to completion month, or start month for deposits on active projects."
          onExport={() => csv('recorded-revenue', [['Month', 'Recorded revenue'], ...months.map((m, i) => [m.key, revenue[i]!])])}
          className="xl:col-span-2"
        >
          <LineChart labels={months.map((m) => m.label)} series={[{ name: 'Recorded revenue', values: revenue, color: GOLD, area: true }]} format={(v) => compactMoney(v, sym)} ariaLabel="Recorded revenue per month" />
        </Section>

        <Section
          title="Quotation amounts (projected)"
          subtitle={
            <span className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" /> Projected values from quotations — shown separately and never added to recorded revenue.
            </span>
          }
          onExport={() => csv('quotation-amounts', [['Month', 'Issued (sent/viewed/approved)', 'Approved'], ...months.map((m, i) => [m.key, projected[i]!, approvedQ[i]!])])}
          className="xl:col-span-2"
        >
          <div className="mb-3">
            <Legend
              items={[
                { label: 'Quoted (sent, viewed, approved)', color: SERIES[0]! },
                { label: 'Approved', color: SERIES[2]! },
              ]}
            />
          </div>
          <GroupedBars
            labels={months.map((m) => m.label)}
            series={[
              { name: 'Quoted', values: projected, color: SERIES[0]! },
              { name: 'Approved', values: approvedQ, color: SERIES[2]! },
            ]}
            format={(v) => compactMoney(v, sym)}
            ariaLabel="Quoted vs approved amounts per month"
          />
        </Section>

        <Section title="Most requested services" onExport={() => csv('service-demand', [['Service', 'Inquiries'], ...demand.map((d) => [d.label, d.value])])}>
          <HBarList data={demand.map((d) => ({ ...d, sub: `${inquiries.length ? Math.round((d.value / inquiries.length) * 100) : 0}%` }))} />
        </Section>

        <Section title="Quotation conversion" subtitle="From inquiry to completed project" onExport={() => csv('conversion-funnel', [['Stage', 'Count'], ...funnel.map((f) => [f.label, f.value])])}>
          <HBarList data={funnel.map((f, i) => ({ ...f, sub: i ? `${funnel[i - 1]!.value ? Math.round((f.value / funnel[i - 1]!.value) * 100) : 0}% of previous` : '' }))} max={Math.max(1, funnel[0]!.value)} />
          <div className="mt-5 grid grid-cols-3 gap-3 text-center text-xs">
            {(['Approved', 'Rejected', 'Expired'] as const).map((s) => (
              <div key={s} className="rounded-xl border border-white/[0.06] p-3">
                <p className="font-display text-xl font-semibold text-white">{quotes.filter((q) => q.status === s).length}</p>
                <p className="text-slate-500">{s}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Appointment statistics" onExport={() => csv('appointments', [['Type', ...APPOINTMENT_STATUSES], ...APPOINTMENT_TYPES.map((t) => [t, ...APPOINTMENT_STATUSES.map((s) => appts.filter((a) => a.type === t && a.status === s).length)])])}>
          <SegmentBar data={APPOINTMENT_STATUSES.map((s, i) => ({ label: s, value: appts.filter((a) => a.status === s).length, color: SERIES[i]! }))} />
          <div className="mt-6">
            <HBarList data={APPOINTMENT_TYPES.map((t) => ({ label: t, value: appts.filter((a) => a.type === t).length })).sort((a, b) => b.value - a.value)} color={SERIES[0]} />
          </div>
        </Section>

        <Section title="Project completion" subtitle={`${completed.length} completed · ${completed.length ? Math.round((onTime / completed.length) * 100) : 0}% on or before target date`} onExport={() => csv('project-completion', [['Month', 'Completed'], ...months.map((m, i) => [m.key, completedMonthly[i]!])])}>
          <BarChart data={months.map((m, i) => ({ label: m.label, value: completedMonthly[i]! }))} color={SERIES[2]} ariaLabel="Projects completed per month" height={200} />
        </Section>

        <Section title="Customer activity" subtitle="Top customers in the selected period" className="xl:col-span-2" onExport={() => csv('customer-activity', [['Customer', 'Company', 'Inquiries', 'Recorded revenue'], ...topCustomers.map((x) => [x.c.name, x.c.company, x.inq, x.rev])])}>
          <Table className="-mx-5 -my-5">
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Category</Th>
                <Th className="text-right">Inquiries</Th>
                <Th className="text-right">Recorded revenue</Th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((x) => (
                <tr key={x.c.id}>
                  <Td>
                    <p className="text-slate-200">{x.c.name}</p>
                    <p className="text-xs text-slate-500">{x.c.company}</p>
                  </Td>
                  <Td className="text-xs">{x.c.category}</Td>
                  <Td className="text-right tabular-nums">{x.inq}</Td>
                  <Td className="text-right tabular-nums text-slate-100">{money(x.rev, sym, 0)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      </div>
    </>
  );
}
