import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { NewUserForm } from '@/components/users/NewUserForm';

export default async function NewUserPage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Add User</h1>
      <NewUserForm companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
