import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { withCompanyScope } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/utils';

export default async function AuditLogPage() {
  const ctx = await requireCtx();
  requireAbility(ctx, { resource: 'auditLog', action: 'list', resourceCompanyId: ctx.companyId });
  if (ctx.role !== 'SUPER_ADMIN' && ctx.role !== 'COMPANY_ADMIN') redirect('/dashboard');

  const logs = await prisma.auditLog.findMany({
    where: ctx.role === 'SUPER_ADMIN' ? {} : withCompanyScope(ctx),
    include: { user: true, company: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500">Most recent {logs.length} action(s)</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              {ctx.role === 'SUPER_ADMIN' && <th className="px-4 py-3">Company</th>}
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No audit events yet.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}
                  </td>
                  {ctx.role === 'SUPER_ADMIN' && (
                    <td className="px-4 py-3 text-slate-600">{log.company?.name ?? '—'}</td>
                  )}
                  <td className="px-4 py-3 font-medium text-slate-900">{log.action}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {log.entityType}
                    {log.entityId ? ` #${log.entityId.slice(-6)}` : ''}
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
