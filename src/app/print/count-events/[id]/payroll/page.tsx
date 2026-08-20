import { notFound, redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { assertSameCompany } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { PrintButton } from '@/components/count-events/PrintButton';
import type { CountWorker } from '@prisma/client';

function money(v: unknown): string {
  if (v == null) return '';
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sum(workers: CountWorker[], field: keyof CountWorker): string {
  const total = workers.reduce((acc, w) => acc + Number(w[field] ?? 0), 0);
  return total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatEventDate(d: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(d).toUpperCase();
}

function SupervisorTable({ workers }: { workers: CountWorker[] }) {
  if (workers.length === 0) return null;
  return (
    <table className="mb-8 w-full border-collapse text-xs">
      <thead>
        <tr>
          <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1 text-left">Name</th>
          <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1">Schedule</th>
          <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1">Rate/Day</th>
          <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1">Hourly Rate</th>
          <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1">Hrs Worked</th>
          <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1">Regular Hrs</th>
          <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1">OT Hrs</th>
          <th colSpan={2} className="border border-black bg-slate-200 px-2 py-1">Overtime</th>
          <th colSpan={2} className="border border-black bg-slate-200 px-2 py-1">Pay-out</th>
        </tr>
        <tr>
          <th className="border border-black bg-slate-100 px-2 py-1">Night Diff</th>
          <th className="border border-black bg-slate-100 px-2 py-1">Transpo &amp; Meal</th>
          <th className="border border-black bg-slate-100 px-2 py-1">Night Diff Payout</th>
          <th className="border border-black bg-slate-100 px-2 py-1">Net Pay</th>
        </tr>
      </thead>
      <tbody>
        {workers.map((w) => (
          <tr key={w.id}>
            <td className="border border-black px-2 py-1">{w.name}</td>
            <td className="border border-black px-2 py-1 text-center">—</td>
            <td className="border border-black px-2 py-1 text-right">{money(w.ratePerDay)}</td>
            <td className="border border-black px-2 py-1 text-right">{money(w.hourlyRate)}</td>
            <td className="border border-black px-2 py-1 text-right">{money(w.hoursWorked)}</td>
            <td className="border border-black px-2 py-1 text-right">{money(w.regularHrs)}</td>
            <td className="border border-black px-2 py-1 text-right">{money(w.otHrs)}</td>
            <td className="border border-black px-2 py-1 text-right">{money(w.nightDiffHrs)}</td>
            <td className="border border-black px-2 py-1 text-right">{money(w.transpoAllowance)}</td>
            <td className="border border-black px-2 py-1 text-right">{money(w.nightDiffPayout)}</td>
            <td className="border border-black px-2 py-1 text-right font-semibold">{money(w.netPay)}</td>
          </tr>
        ))}
        <tr>
          <td colSpan={10} className="border border-black px-2 py-1 text-right font-bold">Total</td>
          <td className="border border-black px-2 py-1 text-right font-bold">{sum(workers, 'netPay')}</td>
        </tr>
        {workers.some((w) => w.deductionLess != null && Number(w.deductionLess) !== 0) && (
          <>
            <tr>
              <td colSpan={10} className="border border-black px-2 py-1 text-right font-bold">LESS</td>
              <td className="border border-black px-2 py-1 text-right">{sum(workers, 'deductionLess')}</td>
            </tr>
            <tr>
              <td colSpan={10} className="border border-black px-2 py-1 text-right font-bold">TOTAL</td>
              <td className="border border-black px-2 py-1 text-right font-bold">
                {(
                  workers.reduce((a, w) => a + Number(w.netPay ?? 0), 0) -
                  workers.reduce((a, w) => a + Number(w.deductionLess ?? 0), 0)
                ).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  );
}

function StaffTable({ title, workers, showTin }: { title: string; workers: CountWorker[]; showTin: boolean }) {
  if (workers.length === 0) return null;
  return (
    <div className="mb-8">
      <h2 className="mb-1 text-sm font-bold">{title}</h2>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th rowSpan={2} className="w-8 border border-black bg-slate-200 px-2 py-1">No.</th>
            <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1 text-left">Counter Name</th>
            {showTin && <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1">TIN #</th>}
            <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1">Rate/Day</th>
            <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1">Hourly Rate</th>
            <th colSpan={3} className="border border-black bg-slate-200 px-2 py-1">DTR</th>
            <th colSpan={3} className="border border-black bg-slate-200 px-2 py-1">Pay-out</th>
            <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1">Net Pay</th>
            <th rowSpan={2} className="border border-black bg-slate-200 px-2 py-1">Received By</th>
          </tr>
          <tr>
            <th className="border border-black bg-slate-100 px-2 py-1">Regular Hrs</th>
            <th className="border border-black bg-slate-100 px-2 py-1"># Hrs/OT (1.25%)</th>
            <th className="border border-black bg-slate-100 px-2 py-1">Night Diff</th>
            <th className="border border-black bg-slate-100 px-2 py-1">Daily Rate</th>
            <th className="border border-black bg-slate-100 px-2 py-1"># Hrs/OT (1.25%)</th>
            <th className="border border-black bg-slate-100 px-2 py-1">Night Diff</th>
          </tr>
        </thead>
        <tbody>
          {workers.map((w, i) => (
            <tr key={w.id}>
              <td className="border border-black px-2 py-1 text-center">{i + 1}</td>
              <td className="border border-black px-2 py-1">{w.name}</td>
              {showTin && <td className="border border-black px-2 py-1">{w.tin ?? ''}</td>}
              <td className="border border-black px-2 py-1 text-right">{money(w.ratePerDay)}</td>
              <td className="border border-black px-2 py-1 text-right">{money(w.hourlyRate)}</td>
              <td className="border border-black px-2 py-1 text-right">{money(w.regularHrs)}</td>
              <td className="border border-black px-2 py-1 text-right">{money(w.otHrs)}</td>
              <td className="border border-black px-2 py-1 text-right">{money(w.nightDiffHrs)}</td>
              <td className="border border-black px-2 py-1 text-right">{money(w.dailyRatePayout)}</td>
              <td className="border border-black px-2 py-1 text-right">{money(w.otPayout)}</td>
              <td className="border border-black px-2 py-1 text-right">{money(w.nightDiffPayout)}</td>
              <td className="border border-black px-2 py-1 text-right font-semibold">{money(w.netPay)}</td>
              <td className="border border-black px-2 py-1">&nbsp;</td>
            </tr>
          ))}
          <tr>
            <td colSpan={showTin ? 10 : 9} className="border border-black px-2 py-1 text-right font-bold">
              Total
            </td>
            <td className="border border-black px-2 py-1 text-right font-bold">{sum(workers, 'netPay')}</td>
            <td className="border border-black"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function PayrollSheetPrintPage({ params }: { params: { id: string } }) {
  const ctx = await requireCtx().catch(() => null);
  if (!ctx) redirect('/login');
  requireAbility(ctx, { resource: 'countEvent', action: 'read', resourceCompanyId: ctx.companyId });

  const event = await prisma.countEvent.findUnique({
    where: { id: params.id },
    include: { workers: { orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  });
  if (!event) notFound();
  assertSameCompany(ctx, event);

  const supervisors = event.workers.filter((w) => w.position === 'SUPERVISOR');
  const encoders = event.workers.filter((w) => w.position === 'ENCODER');
  const counters = event.workers.filter((w) => w.position === 'COUNTER');

  return (
    <div className="print-page-payroll mx-auto max-w-5xl bg-white p-8 text-black print:p-0">
      <PrintButton />

      <div className="mb-4 space-y-0.5 text-sm">
        <p className="font-bold">{event.agencyName}</p>
        <p className="font-bold">{event.siteName}</p>
        <p className="font-bold">Inventory Count {formatEventDate(event.eventDate)}</p>
        <p className="font-bold">
          Time Schedule : {event.timeScheduleStart} to {event.timeScheduleEnd}
        </p>
      </div>

      <SupervisorTable workers={supervisors} />
      <StaffTable title="Encoders" workers={encoders} showTin={false} />
      <StaffTable title="Counters" workers={counters} showTin />

      {event.workers.length === 0 && (
        <p className="text-sm text-slate-500">No one on this count sheet yet.</p>
      )}
    </div>
  );
}
