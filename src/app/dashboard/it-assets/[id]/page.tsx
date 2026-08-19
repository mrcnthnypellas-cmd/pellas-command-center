import { notFound } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { assertSameCompany } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { AssetLifecycleActions } from '@/components/assets/AssetLifecycleActions';

export default async function AssetDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireCtx();

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    include: { assignedEmployee: { include: { user: true } } },
  });
  if (!asset) notFound();
  assertSameCompany(ctx, asset);
  requireAbility(ctx, { resource: 'asset', action: 'read', resourceCompanyId: asset.companyId });

  const [history, employees] = await Promise.all([
    prisma.assetHistory.findMany({
      where: { assetId: asset.id },
      include: {
        fromEmployee: { include: { user: true } },
        toEmployee: { include: { user: true } },
        performedByUser: true,
      },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.employee.findMany({
      where: { companyId: asset.companyId, employmentStatus: 'ACTIVE' },
      include: { user: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{asset.assetTag}</h1>
        <p className="text-sm text-slate-500">
          {asset.brand} {asset.model} — {asset.category}
        </p>
      </div>

      <div className="card grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
        <Field label="Serial number" value={asset.serialNumber ?? '—'} />
        <Field label="Condition" value={asset.condition} />
        <Field label="Status" value={asset.status.replace('_', ' ')} />
        <Field
          label="Assigned to"
          value={asset.assignedEmployee ? `${asset.assignedEmployee.user.firstName} ${asset.assignedEmployee.user.lastName}` : '—'}
        />
        <Field label="Purchase date" value={asset.purchaseDate ? formatDate(asset.purchaseDate) : '—'} />
        <Field label="Cost" value={asset.cost ? formatCurrency(Number(asset.cost)) : '—'} />
        <Field label="Supplier" value={asset.supplier ?? '—'} />
        <Field label="Warranty expires" value={asset.warrantyExpiresAt ? formatDate(asset.warrantyExpiresAt) : '—'} />
        <Field label="Location" value={asset.location ?? '—'} />
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Lifecycle Actions</h2>
        <AssetLifecycleActions
          assetId={asset.id}
          isAssigned={!!asset.assignedEmployeeId}
          employees={employees
            .filter((e) => e.id !== asset.assignedEmployeeId)
            .map((e) => ({ id: e.id, firstName: e.user.firstName, lastName: e.user.lastName }))}
        />
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No history yet.</p>
        ) : (
          <ul className="space-y-3">
            {history.map((h) => (
              <li key={h.id} className="border-b border-slate-100 pb-3 text-sm last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{h.action}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(h.timestamp)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {h.fromEmployee && <>From {h.fromEmployee.user.firstName} {h.fromEmployee.user.lastName}. </>}
                  {h.toEmployee && <>To {h.toEmployee.user.firstName} {h.toEmployee.user.lastName}. </>}
                  By {h.performedByUser.firstName} {h.performedByUser.lastName}.
                </div>
                {h.notes && <p className="mt-1 text-sm text-slate-700">{h.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm text-slate-900">{value}</div>
    </div>
  );
}
