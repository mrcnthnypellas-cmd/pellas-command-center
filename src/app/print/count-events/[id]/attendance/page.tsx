import { notFound, redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { assertSameCompany } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { PrintButton } from '@/components/count-events/PrintButton';

const POSITION_LABEL: Record<string, string> = {
  SUPERVISOR: 'Counter Supervisor',
  ENCODER: 'Encoder',
  COUNTER: 'Counter',
};

function formatEventDate(d: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(d).toUpperCase();
}

export default async function AttendanceSheetPrintPage({ params }: { params: { id: string } }) {
  const ctx = await requireCtx().catch(() => null);
  if (!ctx) redirect('/login');
  requireAbility(ctx, { resource: 'countEvent', action: 'read', resourceCompanyId: ctx.companyId });

  const event = await prisma.countEvent.findUnique({
    where: { id: params.id },
    include: { workers: { orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  });
  if (!event) notFound();
  assertSameCompany(ctx, event);

  return (
    <div className="print-page-attendance mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <PrintButton />

      <div className="mb-4 flex items-center justify-between border-b-2 border-black pb-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-blue-800 text-[10px] font-bold text-blue-800">
          LOGO
        </div>
        <h1 className="text-2xl font-bold tracking-wide">ATTENDANCE SHEET</h1>
        <div className="text-lg font-bold italic text-red-700">Mondelez</div>
      </div>

      <div className="mb-4 space-y-0.5 text-sm">
        <p className="font-bold">{event.agencyName}</p>
        <p className="font-bold">{event.siteName}</p>
        <p className="font-bold">Inventory Count {formatEventDate(event.eventDate)}</p>
        <p className="font-bold">
          Time Schedule : {event.timeScheduleStart} to {event.timeScheduleEnd}
        </p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-10 border border-black bg-slate-200 px-2 py-1.5 text-left">No.</th>
            <th className="border border-black bg-slate-200 px-2 py-1.5 text-left">Counter Name</th>
            <th className="w-40 border border-black bg-slate-200 px-2 py-1.5 text-left">Position</th>
            <th className="w-40 border border-black bg-slate-200 px-2 py-1.5 text-left">Signature</th>
          </tr>
        </thead>
        <tbody>
          {event.workers.map((w, i) => (
            <tr key={w.id}>
              <td className="border border-black px-2 py-1.5">{i + 1}</td>
              <td className="border border-black px-2 py-1.5">{w.name}</td>
              <td className="border border-black px-2 py-1.5">{POSITION_LABEL[w.position]}</td>
              <td className="border border-black px-2 py-1.5">&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-10 space-y-8 text-sm">
        <p className="font-bold">Attested By:</p>
        <div className="w-64 border-t border-black pt-1">{event.clientName} (representative)</div>
      </div>
    </div>
  );
}
