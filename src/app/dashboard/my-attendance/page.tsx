import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/utils';

export default async function MyAttendancePage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'EMPLOYEE') redirect('/dashboard');

  const employee = await prisma.employee.findUnique({ where: { userId: ctx.userId } });
  if (!employee) redirect('/dashboard');

  // Owner-scoped by construction — employee.id is derived from the session, never from
  // a client-supplied param, so this route cannot be pointed at another employee's log.
  const events = await prisma.attendance.findMany({
    where: { employeeId: employee.id },
    orderBy: { timestamp: 'desc' },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Attendance</h1>

      <div className="card divide-y divide-slate-100">
        {events.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No attendance recorded yet.</p>
        ) : (
          events.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className={e.type === 'IN' ? 'text-emerald-700' : 'text-red-700'}>
                {e.type === 'IN' ? 'Time In' : 'Time Out'}
              </span>
              <span className="text-slate-500">{formatDateTime(e.timestamp)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
