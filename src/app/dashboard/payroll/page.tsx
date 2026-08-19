import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { withCompanyScope } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { formatCurrency, formatDate } from '@/lib/utils';
import { NewPayrollForm } from '@/components/payroll/NewPayrollForm';
import { PayrollActions } from '@/components/payroll/PayrollActions';

export default async function PayrollPage() {
  const ctx = await requireCtx();
  requireAbility(ctx, { resource: 'payroll', action: 'list', resourceCompanyId: ctx.companyId });

  const scope = withCompanyScope(ctx);
  const [payrolls, employees] = await Promise.all([
    prisma.payroll.findMany({
      where: scope,
      include: { employee: { include: { user: true } } },
      orderBy: { payPeriodStart: 'desc' },
    }),
    prisma.employee.findMany({
      where: scope,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Payroll</h1>
          <p className="text-sm text-slate-500">{payrolls.length} payroll record(s)</p>
        </div>
      </div>

      <NewPayrollForm
        employees={employees.map((e) => ({
          id: e.id,
          firstName: e.user.firstName,
          lastName: e.user.lastName,
          employeeCode: e.employeeCode,
        }))}
      />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Gross</th>
              <th className="px-4 py-3">Net</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payrolls.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No payroll runs yet.
                </td>
              </tr>
            ) : (
              payrolls.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {p.employee.user.firstName} {p.employee.user.lastName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(p.payPeriodStart)} – {formatDate(p.payPeriodEnd)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(Number(p.gross))}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(Number(p.net))}</td>
                  <td className="px-4 py-3 text-slate-600">{p.status}</td>
                  <td className="px-4 py-3">
                    <PayrollActions id={p.id} status={p.status} />
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
