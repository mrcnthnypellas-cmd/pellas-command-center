import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { withCompanyScope } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';
import { StatCard } from '@/components/dashboard/StatCard';
import { Users, Wallet, Receipt, Building2 } from 'lucide-react';

export default async function ReportsPage() {
  const ctx = await requireCtx();
  requireAbility(ctx, { resource: 'report', action: 'read', resourceCompanyId: ctx.companyId });

  if (ctx.role === 'SUPER_ADMIN') {
    const [companies, users] = await Promise.all([prisma.company.count(), prisma.user.count()]);
    const byRole = await prisma.user.groupBy({ by: ['role'], _count: true });

    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">Platform Reports</h1>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Companies" value={companies} icon={Building2} accent="brand" />
          <StatCard label="Total Users" value={users} icon={Users} accent="slate" />
        </div>
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Users by Role</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {byRole.map((r) => (
              <li key={r.role} className="flex justify-between py-2">
                <span>{r.role}</span>
                <span className="font-medium">{r._count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const scope = withCompanyScope(ctx);
  const showHr = ctx.role === 'COMPANY_ADMIN' || ctx.role === 'HR_ADMIN';
  const showIt = ctx.role === 'COMPANY_ADMIN' || ctx.role === 'IT_ADMIN';
  const showBiz = ctx.role === 'COMPANY_ADMIN';

  const [employeeCount, payrollTotals, assetsByStatus, transactionTotals, byDepartment] = await Promise.all([
    showHr ? prisma.employee.count({ where: scope }) : Promise.resolve(0),
    showHr
      ? prisma.payroll.aggregate({ where: { ...scope, status: 'PAID' }, _sum: { net: true }, _count: true })
      : Promise.resolve(null),
    showIt ? prisma.asset.groupBy({ by: ['status'], where: scope, _count: true }) : Promise.resolve([]),
    showBiz
      ? prisma.transaction.aggregate({ where: scope, _sum: { amount: true }, _count: true })
      : Promise.resolve(null),
    showHr ? prisma.employee.groupBy({ by: ['department'], where: scope, _count: true }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Reports</h1>

      {showHr && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">HR Reports</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Employees" value={employeeCount} icon={Users} accent="brand" />
            <StatCard
              label="Total Paid (Net)"
              value={payrollTotals?._sum.net ? formatCurrency(Number(payrollTotals._sum.net)) : '₱0'}
              icon={Wallet}
              accent="green"
            />
            <StatCard label="Payroll Runs (Paid)" value={payrollTotals?._count ?? 0} icon={Wallet} accent="amber" />
          </div>
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Headcount by Department</h3>
            <ul className="divide-y divide-slate-100 text-sm">
              {byDepartment.map((d) => (
                <li key={d.department} className="flex justify-between py-2">
                  <span>{d.department}</span>
                  <span className="font-medium">{d._count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {showIt && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">IT Asset Reports</h2>
          <div className="card p-5">
            <ul className="divide-y divide-slate-100 text-sm">
              {assetsByStatus.map((s) => (
                <li key={s.status} className="flex justify-between py-2">
                  <span>{s.status.replace('_', ' ')}</span>
                  <span className="font-medium">{s._count}</span>
                </li>
              ))}
              {assetsByStatus.length === 0 && <li className="py-2 text-slate-500">No assets yet.</li>}
            </ul>
          </div>
        </div>
      )}

      {showBiz && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Business Reports</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard
              label="Total Transaction Value"
              value={transactionTotals?._sum.amount ? formatCurrency(Number(transactionTotals._sum.amount)) : '₱0'}
              icon={Receipt}
              accent="brand"
            />
            <StatCard label="Total Transactions" value={transactionTotals?._count ?? 0} icon={Receipt} accent="slate" />
          </div>
        </div>
      )}
    </div>
  );
}
