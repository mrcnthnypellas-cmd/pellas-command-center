import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Header } from '@/components/dashboard/Header';
import { prisma } from '@/lib/prisma';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession().catch(() => null);
  if (!session?.user) redirect('/login');
  if (session.user.role === 'CLIENT') redirect('/portal');

  const [unreadNotifications, company] = await Promise.all([
    prisma.notification.count({ where: { userId: session.user.id, isRead: false } }),
    session.user.companyId
      ? prisma.company.findUnique({ where: { id: session.user.companyId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 lg:block">
        <Sidebar
          role={session.user.role}
          companyName={company?.name ?? (session.user.role === 'SUPER_ADMIN' ? 'All Companies' : undefined)}
          firstName={session.user.firstName}
          lastName={session.user.lastName}
          className="sticky top-0 h-screen"
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          role={session.user.role}
          firstName={session.user.firstName}
          lastName={session.user.lastName}
          companyName={company?.name}
          unreadNotifications={unreadNotifications}
        />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
