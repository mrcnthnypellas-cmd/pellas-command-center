import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { withCompanyScope } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { serializeEmployee } from '@/lib/serializers/employee';
import { EmployeeTable } from '@/components/employees/EmployeeTable';

export default async function EmployeesPage() {
  const ctx = await requireCtx();
  requireAbility(ctx, { resource: 'employee', action: 'list', resourceCompanyId: ctx.companyId });

  const employees = await prisma.employee.findMany({
    where: withCompanyScope(ctx),
    include: { user: true },
    orderBy: { createdAt: 'desc' },
  });

  const rows = employees.map((e) => serializeEmployee(e, ctx.role, ctx.userId));
  const canCreate = ctx.role === 'SUPER_ADMIN' || ctx.role === 'COMPANY_ADMIN' || ctx.role === 'HR_ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500">{rows.length} employee(s)</p>
        </div>
        {canCreate && (
          <Link href="/dashboard/employees/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            New Employee
          </Link>
        )}
      </div>

      <EmployeeTable employees={rows} />
    </div>
  );
}
