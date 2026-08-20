import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Printer, ArrowLeft } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { assertSameCompany } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { CountEventMetaForm } from '@/components/count-events/CountEventMetaForm';
import { CountRosterEditor } from '@/components/count-events/CountRosterEditor';

export default async function CountEventDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireCtx();
  if (ctx.role === 'IT_ADMIN' || ctx.role === 'EMPLOYEE' || ctx.role === 'CLIENT') redirect('/dashboard');
  requireAbility(ctx, { resource: 'countEvent', action: 'read', resourceCompanyId: ctx.companyId });

  const event = await prisma.countEvent.findUnique({
    where: { id: params.id },
    include: { workers: { orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  });
  if (!event) notFound();
  assertSameCompany(ctx, event);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/mondelez-attendance" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Mondelez Attendance
          </Link>
          <h1 className="text-xl font-semibold text-slate-900">{event.siteName}</h1>
          <p className="text-sm text-slate-500">{event.workers.length} staff on this count sheet</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/print/count-events/${event.id}/attendance`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            <Printer className="h-4 w-4" />
            Print Attendance Sheet
          </a>
          <a
            href={`/print/count-events/${event.id}/payroll`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            <Printer className="h-4 w-4" />
            Print Payroll Sheet
          </a>
        </div>
      </div>

      <CountEventMetaForm
        event={{
          id: event.id,
          siteName: event.siteName,
          agencyName: event.agencyName,
          clientName: event.clientName,
          eventDate: event.eventDate.toISOString().slice(0, 10),
          timeScheduleStart: event.timeScheduleStart,
          timeScheduleEnd: event.timeScheduleEnd,
        }}
      />

      <CountRosterEditor
        countEventId={event.id}
        initialWorkers={event.workers.map((w) => ({
          id: w.id,
          name: w.name,
          position: w.position,
          tin: w.tin,
          ratePerDay: w.ratePerDay?.toString() ?? '',
          hourlyRate: w.hourlyRate?.toString() ?? '',
          hoursWorked: w.hoursWorked?.toString() ?? '',
          regularHrs: w.regularHrs?.toString() ?? '',
          otHrs: w.otHrs?.toString() ?? '',
          nightDiffHrs: w.nightDiffHrs?.toString() ?? '',
          dailyRatePayout: w.dailyRatePayout?.toString() ?? '',
          otPayout: w.otPayout?.toString() ?? '',
          nightDiffPayout: w.nightDiffPayout?.toString() ?? '',
          transpoAllowance: w.transpoAllowance?.toString() ?? '',
          deductionLess: w.deductionLess?.toString() ?? '',
          netPay: w.netPay?.toString() ?? '',
          receivedBy: w.receivedBy,
        }))}
      />
    </div>
  );
}
