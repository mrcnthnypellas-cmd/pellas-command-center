import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';

export default async function MyAssetsPage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'EMPLOYEE') redirect('/dashboard');

  const employee = await prisma.employee.findUnique({ where: { userId: ctx.userId } });
  if (!employee) redirect('/dashboard');

  // Owner-scoped by construction — assignedEmployeeId is compared against the
  // session-derived employee.id, never a client-supplied value.
  const assets = await prisma.asset.findMany({
    where: { assignedEmployeeId: employee.id },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Assets</h1>

      {assets.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No assets assigned to you.</div>
      ) : (
        <div className="space-y-3">
          {assets.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-900">{a.assetTag}</div>
                <span className="badge bg-emerald-50 text-emerald-700">{a.status}</span>
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {a.brand} {a.model} — {a.category}
              </div>
              {a.warrantyExpiresAt && (
                <div className="mt-1 text-xs text-slate-500">
                  Warranty until {formatDate(a.warrantyExpiresAt)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
