import { requireCtx } from '@/lib/session';
import { requireAbility, can } from '@/lib/permissions';
import { withCompanyScope } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/utils';
import { NewEventForm } from '@/components/calendar/NewEventForm';
import { ExcelImportPanel } from '@/components/calendar/ExcelImportPanel';

export default async function CalendarPage() {
  const ctx = await requireCtx();
  requireAbility(ctx, { resource: 'calendarEvent', action: 'list', resourceCompanyId: ctx.companyId });

  const events = await prisma.calendarEvent.findMany({
    where: withCompanyScope(ctx),
    orderBy: { startAt: 'asc' },
  });

  const canCreate = can(ctx, { resource: 'calendarEvent', action: 'create', resourceCompanyId: ctx.companyId });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Calendar</h1>
        <p className="text-sm text-slate-500">{events.length} event(s)</p>
      </div>

      {canCreate && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <NewEventForm />
          <ExcelImportPanel />
        </div>
      )}

      <div className="card divide-y divide-slate-100">
        {events.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No events yet.</p>
        ) : (
          events.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{e.title}</span>
                  {e.isDeadline && <span className="badge bg-red-50 text-red-700">Deadline</span>}
                  {e.source === 'EXCEL_IMPORT' && (
                    <span className="badge bg-slate-100 text-slate-600">Imported</span>
                  )}
                </div>
                {e.description && <p className="mt-0.5 text-xs text-slate-500">{e.description}</p>}
                {e.department && <p className="mt-0.5 text-xs text-slate-400">{e.department}</p>}
              </div>
              <div className="shrink-0 text-right text-xs text-slate-500">
                <div>{formatDateTime(e.startAt)}</div>
                {e.location && <div>{e.location}</div>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
