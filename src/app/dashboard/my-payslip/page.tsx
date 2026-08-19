import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { PayslipDocument } from '@/components/payroll/PayslipDocument';

export default async function MyPayslipPage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'EMPLOYEE') redirect('/dashboard');

  const employee = await prisma.employee.findUnique({
    where: { userId: ctx.userId },
    include: { user: true, company: true },
  });
  if (!employee) redirect('/dashboard');

  // Owner-scoped by construction: employeeId comes from the session-derived employee
  // record, never a client param — an employee can never fetch a colleague's payslips.
  const payslips = await prisma.payslip.findMany({
    where: { employeeId: employee.id },
    include: { payroll: true },
    orderBy: { issuedAt: 'desc' },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Payslip</h1>

      {payslips.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No payslips issued yet.</div>
      ) : (
        <div className="space-y-4">
          {payslips.map((p) => (
            <PayslipDocument
              key={p.id}
              payslip={{
                id: p.id,
                companyName: employee.company.name,
                employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
                employeeCode: employee.employeeCode,
                department: employee.department,
                position: employee.position,
                payPeriodStart: p.payroll.payPeriodStart.toISOString(),
                payPeriodEnd: p.payroll.payPeriodEnd.toISOString(),
                gross: Number(p.payroll.gross),
                sssDeduction: Number(p.payroll.sssDeduction),
                philhealthDeduction: Number(p.payroll.philhealthDeduction),
                pagibigDeduction: Number(p.payroll.pagibigDeduction),
                taxDeduction: Number(p.payroll.taxDeduction),
                otherDeductions: Number(p.payroll.otherDeductions),
                net: Number(p.payroll.net),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
