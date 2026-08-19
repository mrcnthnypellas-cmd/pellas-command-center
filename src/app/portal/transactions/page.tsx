import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'badge bg-amber-50 text-amber-700',
  PROCESSING: 'badge bg-brand-50 text-brand-700',
  COMPLETED: 'badge bg-emerald-50 text-emerald-700',
  CANCELLED: 'badge bg-red-50 text-red-700',
};

export default async function PortalTransactionsPage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'CLIENT') redirect('/dashboard');

  const client = await prisma.client.findUnique({ where: { userId: ctx.userId } });
  if (!client) redirect('/login');

  // Owner-scoped by construction — this is exactly the guard the "Client A cannot read
  // Client B transaction" negative test case (spec §3) is checking for.
  const transactions = await prisma.transaction.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Transactions</h1>

      <div className="space-y-3">
        {transactions.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500">No transactions yet.</div>
        ) : (
          transactions.map((t) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-slate-900">{t.service}</div>
                  <div className="text-xs text-slate-500">{t.transactionCode}</div>
                </div>
                <span className={STATUS_BADGE[t.status]}>{t.status}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-500">{formatDate(t.createdAt)}</span>
                <span className="font-medium text-slate-900">{formatCurrency(Number(t.amount))}</span>
              </div>
              {t.remarks && <p className="mt-2 text-sm text-slate-600">{t.remarks}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
