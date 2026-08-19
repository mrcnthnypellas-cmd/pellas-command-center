import Link from 'next/link';
import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { withCompanyScope } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { NewAssetForm } from '@/components/assets/NewAssetForm';
import { formatDate } from '@/lib/utils';

const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: 'badge bg-slate-100 text-slate-600',
  ASSIGNED: 'badge bg-emerald-50 text-emerald-700',
  IN_REPAIR: 'badge bg-amber-50 text-amber-700',
  RETIRED: 'badge bg-red-50 text-red-700',
  LOST: 'badge bg-red-50 text-red-700',
};

export default async function ItAssetsPage() {
  const ctx = await requireCtx();
  requireAbility(ctx, { resource: 'asset', action: 'list', resourceCompanyId: ctx.companyId });

  const assets = await prisma.asset.findMany({
    where: withCompanyScope(ctx),
    include: { assignedEmployee: { include: { user: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">IT Assets</h1>
          <p className="text-sm text-slate-500">{assets.length} asset(s)</p>
        </div>
      </div>

      <NewAssetForm />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Tag</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Assigned To</th>
              <th className="px-4 py-3">Warranty</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assets.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No assets yet.
                </td>
              </tr>
            ) : (
              assets.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/dashboard/it-assets/${a.id}`} className="text-brand-700 hover:underline">
                      {a.assetTag}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {a.brand} {a.model}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.category}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.assignedEmployee ? `${a.assignedEmployee.user.firstName} ${a.assignedEmployee.user.lastName}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.warrantyExpiresAt ? formatDate(a.warrantyExpiresAt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_BADGE[a.status]}>{a.status.replace('_', ' ')}</span>
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
