import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { NewEmployeeForm } from '@/components/employees/NewEmployeeForm';

export default async function NewEmployeePage() {
  const ctx = await requireCtx();
  requireAbility(ctx, { resource: 'employee', action: 'create', resourceCompanyId: ctx.companyId });

  const canSetConfidential = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_ADMIN'].includes(ctx.role);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">New Employee</h1>
      <NewEmployeeForm canSetConfidential={canSetConfidential} />
    </div>
  );
}
