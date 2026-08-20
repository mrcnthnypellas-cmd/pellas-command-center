import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { withCompanyScope } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { NewCountEventForm } from '@/components/count-events/NewCountEventForm';

export default async function MondelezAttendancePage() {
  const ctx = await requireCtx();
  if (ctx.role === 'IT_ADMIN' || ctx.role === 'EMPLOYEE' || ctx.role === 'CLIENT') redirect('/dashboard');
  requireAbility(ctx, { resource: 'countEvent', action: 'list', resourceCompanyId: ctx.companyId });

  const events = await prisma.countEvent.findMany({
    where: withCompanyScope(ctx),
    include: { _count: { select: { workers: true } } },
    orderBy: { eventDate: 'desc' },
    take: 200,
  });

  const companies = ctx.role === 'SUPER_ADMIN' ? await prisma.company.findMany({ orderBy: { name: 'asc' } }) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Mondelez Attendance</h1>
        <p className="text-sm text-slate-500">
          Attendance sheets and payroll for inventory-count staff (counters, encoders, supervisors) —
          separate from the regular employee roster.
        </p>
      </div>

      <NewCountEventForm companies={companies} isSuperAdmin={ctx.role === 'SUPER_ADMIN'} />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No count sheets yet.
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{e.siteName}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(e.eventDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{e._count.workers}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/mondelez-attendance/${e.id}`} className="btn-secondary py-1.5 text-xs">
                      Open
                    </Link>
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
