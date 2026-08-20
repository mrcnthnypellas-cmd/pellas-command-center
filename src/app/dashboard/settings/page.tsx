import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { requireAbility } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { LoginBackgroundSettings } from '@/components/settings/LoginBackgroundSettings';
import { TimezoneSettings } from '@/components/settings/TimezoneSettings';
import { BrandingSettings } from '@/components/settings/BrandingSettings';
import { ThemeSettings } from '@/components/settings/ThemeSettings';
import { ZoomSettings } from '@/components/settings/ZoomSettings';
import { LedBannerSettings } from '@/components/settings/LedBannerSettings';

// Super Admin sees every platform-wide setting. HR Admin/IT Admin are let in only
// for the LED banner (they have the 'ledBanner' ability but not 'platformSetting') —
// everything else on this page stays Super-Admin-only per the original spec.
const ALLOWED_ROLES = ['SUPER_ADMIN', 'HR_ADMIN', 'IT_ADMIN'] as const;

export default async function PlatformSettingsPage() {
  const ctx = await requireCtx();
  if (!ALLOWED_ROLES.includes(ctx.role as (typeof ALLOWED_ROLES)[number])) redirect('/dashboard');

  const setting = await prisma.platformSetting.findUnique({ where: { id: 'singleton' } });
  const bannerValues = {
    bannerEnabled: setting?.bannerEnabled ?? false,
    bannerMessage: setting?.bannerMessage ?? '',
    bannerTextColor: setting?.bannerTextColor ?? '#ffffff',
    bannerBackgroundColor: setting?.bannerBackgroundColor ?? '#dc2626',
    bannerFontFamily: setting?.bannerFontFamily ?? null,
    bannerSpeedSeconds: setting?.bannerSpeedSeconds ?? 20,
    bannerHeight: setting?.bannerHeight ?? 40,
  };

  if (ctx.role !== 'SUPER_ADMIN') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard Banner</h1>
          <p className="text-sm text-slate-500">Edit the scrolling banner shown at the top of every dashboard.</p>
        </div>
        <LedBannerSettings current={bannerValues} />
      </div>
    );
  }

  requireAbility(ctx, { resource: 'platformSetting', action: 'read', resourceCompanyId: null });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Platform Settings</h1>
        <p className="text-sm text-slate-500">Branding and configuration shared across every company.</p>
      </div>

      <BrandingSettings currentAppName={setting?.appName ?? 'My Pellas Command Center'} hasLogo={!!setting?.logoStorageKey} />
      <ThemeSettings
        currentPrimary={setting?.themePrimaryColor ?? null}
        currentBackground={setting?.themeBackgroundColor ?? null}
        currentFont={setting?.themeFontFamily ?? null}
      />
      <ZoomSettings currentZoom={setting?.zoomPercent ?? 100} />
      <LedBannerSettings current={bannerValues} />
      <TimezoneSettings currentTimezone={setting?.timezone ?? 'Asia/Manila'} />
      <LoginBackgroundSettings hasBackground={!!setting?.loginBackgroundStorageKey} />
    </div>
  );
}
