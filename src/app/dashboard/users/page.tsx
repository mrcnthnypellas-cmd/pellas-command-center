import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Pencil } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { roleLabel } from '@/lib/utils';
import { UserStatusToggle } from '@/components/users/UserStatusToggle';

export default async function UsersPage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const users = await prisma.user.findMany({
    include: { company: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">{users.length} user(s)</p>
        </div>
        <Link href="/dashboard/users/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          Add User
        </Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {u.firstName} {u.lastName}
                  </div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{u.company?.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{roleLabel(u.role)}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      u.status === 'ACTIVE'
                        ? 'badge bg-emerald-50 text-emerald-700'
                        : 'badge bg-slate-100 text-slate-600'
                    }
                  >
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/dashboard/users/${u.id}/edit`}
                      className="btn-secondary py-1.5 text-xs"
                      aria-label={`Edit ${u.firstName} ${u.lastName}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Link>
                    {u.id !== ctx.userId && <UserStatusToggle userId={u.id} status={u.status} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
