import { notFound } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { requireAbility, can } from '@/lib/permissions';
import { assertSameCompany } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { serializeEmployee } from '@/lib/serializers/employee';
import { EmployeeDetailView } from '@/components/employees/EmployeeDetailView';

export default async function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireCtx();

  const employee = await prisma.employee.findUnique({
    where: { id: params.id },
    include: { user: true },
  });
  if (!employee) notFound();
  assertSameCompany(ctx, employee);

  const isSelf = employee.userId === ctx.userId;
  requireAbility(ctx, {
    resource: 'employee',
    action: 'read',
    resourceCompanyId: employee.companyId,
    ownerUserId: isSelf ? ctx.userId : undefined,
  });

  const data = serializeEmployee(employee, ctx.role, ctx.userId);
  const canEdit = can(ctx, { resource: 'employee', action: 'update', resourceCompanyId: employee.companyId });
  const canEditConfidential = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_ADMIN'].includes(ctx.role);

  return (
    <div className="mx-auto max-w-3xl">
      <EmployeeDetailView
        employee={{ ...data, hireDate: data.hireDate.toISOString() }}
        canEdit={canEdit}
        canEditConfidential={canEditConfidential}
      />
    </div>
  );
}
