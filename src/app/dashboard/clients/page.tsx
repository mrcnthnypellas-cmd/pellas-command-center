import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { withCompanyScope } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { NewClientForm } from '@/components/clients/NewClientForm';

export default async function ClientsPage() {
  const ctx = await requireCtx();
  requireAbility(ctx, { resource: 'client', action: 'list', resourceCompanyId: ctx.companyId });

  const clients = await prisma.client.findMany({
    where: withCompanyScope(ctx),
    include: { user: true, _count: { select: { transactions: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Clients</h1>
        <p className="text-sm text-slate-500">{clients.length} client(s)</p>
      </div>

      <NewClientForm />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Transactions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No clients yet.
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {c.user.firstName} {c.user.lastName}
                    </div>
                    <div className="text-xs text-slate-500">{c.user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.clientCode}</td>
                  <td className="px-4 py-3 text-slate-600">{c.businessName ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{c._count.transactions}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
