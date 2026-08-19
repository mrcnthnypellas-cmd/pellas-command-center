import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { NewAnnouncementForm } from '@/components/announcements/NewAnnouncementForm';
import { AnnouncementList } from '@/components/announcements/AnnouncementList';

export default async function AnnouncementsPage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'SUPER_ADMIN' && ctx.role !== 'COMPANY_ADMIN') redirect('/dashboard');

  const companyId = ctx.role === 'SUPER_ADMIN' ? null : ctx.companyId;
  requireAbility(ctx, { resource: 'announcement', action: 'create', resourceCompanyId: companyId });

  const announcements = await prisma.announcement.findMany({
    where: ctx.role === 'SUPER_ADMIN' ? { companyId: null } : { companyId: ctx.companyId },
    include: { createdByUser: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Announcements</h1>
        <p className="text-sm text-slate-500">
          {ctx.role === 'SUPER_ADMIN'
            ? 'Posted here are visible on every company’s dashboard.'
            : 'Posted here are visible on your company’s dashboard.'}
        </p>
      </div>

      <NewAnnouncementForm isSuperAdmin={ctx.role === 'SUPER_ADMIN'} />

      <AnnouncementList
        announcements={announcements.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          isActive: a.isActive,
          scope: a.companyId === null ? 'Platform-wide' : 'This company',
          createdAt: a.createdAt.toISOString(),
          createdBy: `${a.createdByUser.firstName} ${a.createdByUser.lastName}`,
        }))}
      />
    </div>
  );
}
