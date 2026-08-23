import { redirect, notFound } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { EditUserForm } from '@/components/users/EditUserForm';
import { DeleteUserButton } from '@/components/users/DeleteUserButton';

export default async function EditUserPage({ params }: { params: { id: string } }) {
  const ctx = await requireCtx();
  if (ctx.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: { employee: true, client: true },
  });
  if (!user) notFound();

  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Edit {user.firstName} {user.lastName}
        </h1>
        <p className="text-sm text-slate-500">Username: {user.email}</p>
      </div>

      <EditUserForm
        user={{
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          companyId: user.companyId,
          status: user.status,
          employee: user.employee
            ? {
                employeeCode: user.employee.employeeCode,
                department: user.employee.department,
                position: user.employee.position,
              }
            : null,
          client: user.client
            ? { clientCode: user.client.clientCode, businessName: user.client.businessName }
            : null,
        }}
        companies={companies}
      />

      {user.id !== ctx.userId && <DeleteUserButton userId={user.id} username={user.email} />}
    </div>
  );
}
