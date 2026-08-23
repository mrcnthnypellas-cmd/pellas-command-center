import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { withCompanyScope } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/utils';
import { StaticMap } from '@/components/dashboard/StaticMap';
import { ExportAttendanceButton } from '@/components/attendance/ExportAttendanceButton';

export default async function AttendancePage() {
  const ctx = await requireCtx();
  requireAbility(ctx, { resource: 'attendance', action: 'list', resourceCompanyId: ctx.companyId });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const events = await prisma.attendance.findMany({
    where: { ...withCompanyScope(ctx), timestamp: { gte: startOfDay } },
    include: { employee: { include: { user: true } } },
    orderBy: { timestamp: 'desc' },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Attendance — Live View</h1>
          <p className="text-sm text-slate-500">Today&apos;s clock in/out events across the company.</p>
        </div>
        <ExportAttendanceButton />
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Attendance Map (Today)</h2>
        <p className="mb-4 text-xs text-slate-500">
          Showing the most recent event · click any row below to open that employee&apos;s exact location.
        </p>
        <StaticMap
          height={260}
          pins={events
            .filter((e) => e.latitude != null && e.longitude != null)
            .map((e) => ({
              id: e.id,
              label: `${e.employee.user.firstName} ${e.employee.user.lastName}`,
              type: e.type,
              lat: e.latitude!,
              lng: e.longitude!,
            }))}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">Location</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No attendance events yet today.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {event.employee.user.firstName} {event.employee.user.lastName}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{event.employee.employeeCode}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        event.type === 'IN'
                          ? 'badge bg-emerald-50 text-emerald-700'
                          : 'badge bg-red-50 text-red-700'
                      }
                    >
                      {event.type === 'IN' ? 'Time In' : 'Time Out'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(event.timestamp)}</td>
                  <td className="px-4 py-3 text-slate-500">{event.device ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {event.latitude != null && event.longitude != null ? (
                      <a
                        href={`https://www.google.com/maps?q=${event.latitude},${event.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 hover:underline"
                      >
                        {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
