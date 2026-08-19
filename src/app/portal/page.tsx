import { redirect } from 'next/navigation';
import { Clock, Loader, CheckCircle2, XCircle } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { StatCard } from '@/components/dashboard/StatCard';
import { AnnouncementCard } from '@/components/dashboard/AnnouncementCard';
import { formatCurrency, formatDate } from '@/lib/utils';

export default async function PortalHomePage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'CLIENT') redirect('/dashboard');

  const client = await prisma.client.findUnique({ where: { userId: ctx.userId } });
  if (!client) redirect('/login');

  // Owner-scoped by construction — clientId comes from the session, not a request param.
  const transactions = await prisma.transaction.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const counts = await prisma.transaction.groupBy({
    by: ['status'],
    where: { clientId: client.id },
    _count: true,
  });
  const countFor = (status: string) => counts.find((c) => c.status === status)?._count ?? 0;

  const announcement = await prisma.announcement.findFirst({
    where: { OR: [{ companyId: null }, { companyId: ctx.companyId }], isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Welcome back</h1>
        <p className="text-sm text-slate-500">Here&apos;s the status of your transactions.</p>
      </div>

      {announcement && <AnnouncementCard title={announcement.title} message={announcement.body} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Pending" value={countFor('PENDING')} icon={Clock} accent="amber" />
        <StatCard label="Processing" value={countFor('PROCESSING')} icon={Loader} accent="brand" />
        <StatCard label="Completed" value={countFor('COMPLETED')} icon={CheckCircle2} accent="green" />
        <StatCard label="Cancelled" value={countFor('CANCELLED')} icon={XCircle} accent="red" />
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent Transactions</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-500">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-slate-900">{t.service}</div>
                  <div className="text-xs text-slate-500">{formatDate(t.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-slate-900">{formatCurrency(Number(t.amount))}</div>
                  <div className="text-xs text-slate-500">{t.status}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
