import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { LoginBackgroundSettings } from '@/components/settings/LoginBackgroundSettings';
import { TimezoneSettings } from '@/components/settings/TimezoneSettings';

export default async function PlatformSettingsPage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'SUPER_ADMIN') redirect('/dashboard');
  requireAbility(ctx, { resource: 'platformSetting', action: 'read', resourceCompanyId: null });

  const setting = await prisma.platformSetting.findUnique({ where: { id: 'singleton' } });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Platform Settings</h1>
        <p className="text-sm text-slate-500">Branding and configuration shared across every company.</p>
      </div>

      <TimezoneSettings currentTimezone={setting?.timezone ?? 'Asia/Manila'} />
      <LoginBackgroundSettings hasBackground={!!setting?.loginBackgroundStorageKey} />
    </div>
  );
}
