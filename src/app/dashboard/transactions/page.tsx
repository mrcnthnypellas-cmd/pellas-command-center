import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { withCompanyScope } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { formatCurrency, formatDate } from '@/lib/utils';
import { NewTransactionForm } from '@/components/transactions/NewTransactionForm';
import { TransactionStatusControl } from '@/components/transactions/TransactionStatusControl';

export default async function TransactionsPage() {
  const ctx = await requireCtx();
  requireAbility(ctx, { resource: 'transaction', action: 'list', resourceCompanyId: ctx.companyId });

  const scope = withCompanyScope(ctx);
  const [transactions, clients] = await Promise.all([
    prisma.transaction.findMany({
      where: scope,
      include: { client: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.client.findMany({ where: scope, include: { user: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Transactions</h1>
        <p className="text-sm text-slate-500">{transactions.length} transaction(s)</p>
      </div>

      <NewTransactionForm
        clients={clients.map((c) => ({ id: c.id, name: `${c.user.firstName} ${c.user.lastName} (${c.clientCode})` }))}
      />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{t.transactionCode}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {t.client.user.firstName} {t.client.user.lastName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{t.service}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(Number(t.amount))}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(t.createdAt)}</td>
                  <td className="px-4 py-3">
                    <TransactionStatusControl id={t.id} status={t.status} />
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
