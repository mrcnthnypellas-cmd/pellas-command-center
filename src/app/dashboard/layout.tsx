import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Header } from '@/components/dashboard/Header';
import { LedBanner } from '@/components/dashboard/LedBanner';
import { prisma } from '@/lib/prisma';
import { fontFamilyCss, isLightColor } from '@/lib/theme';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession().catch(() => null);
  if (!session?.user) redirect('/login');
  if (session.user.role === 'CLIENT') redirect('/portal');

  const [unreadNotifications, company, setting] = await Promise.all([
    prisma.notification.count({ where: { userId: session.user.id, isRead: false } }),
    session.user.companyId
      ? prisma.company.findUnique({ where: { id: session.user.companyId }, select: { name: true } })
      : Promise.resolve(null),
    prisma.platformSetting.findUnique({ where: { id: 'singleton' } }),
  ]);

  const appName = setting?.appName ?? 'My Pellas Command Center';
  const hasLogo = !!setting?.logoStorageKey;
  const bannerVisible = !!setting?.bannerEnabled && !!setting?.bannerMessage?.trim();
  const bannerHeightPx = bannerVisible ? setting!.bannerHeight : 0;
  const themeStyle: React.CSSProperties = {
    ...(setting?.themePrimaryColor ? { '--theme-primary': setting.themePrimaryColor } : {}),
    ...(setting?.themeBackgroundColor
      ? {
          '--theme-bg': setting.themeBackgroundColor,
          // Auto-picked so a custom background always keeps readable text — the rest
          // of the palette (card tint, secondary/muted text) is derived from this
          // plus --theme-bg via color-mix() in globals.css, not hand-set per shade.
          '--theme-text': isLightColor(setting.themeBackgroundColor) ? '#0f172a' : '#f8fafc',
        }
      : {}),
    fontFamily: fontFamilyCss(setting?.themeFontFamily),
    zoom: (setting?.zoomPercent ?? 100) / 100,
  } as React.CSSProperties;

  return (
    <div className="dashboard-shell flex min-h-screen flex-col" style={themeStyle}>
      {bannerVisible && (
        <LedBanner
          message={setting!.bannerMessage}
          textColor={setting!.bannerTextColor}
          backgroundColor={setting!.bannerBackgroundColor}
          fontFamily={setting!.bannerFontFamily}
          speedSeconds={setting!.bannerSpeedSeconds}
          height={bannerHeightPx}
        />
      )}
      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 lg:block">
          <Sidebar
            role={session.user.role}
            companyName={company?.name ?? (session.user.role === 'SUPER_ADMIN' ? 'All Companies' : undefined)}
            firstName={session.user.firstName}
            lastName={session.user.lastName}
            appName={appName}
            hasLogo={hasLogo}
            className="sticky"
            style={{ top: bannerHeightPx, height: `calc(100vh - ${bannerHeightPx}px)` }}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            role={session.user.role}
            firstName={session.user.firstName}
            lastName={session.user.lastName}
            companyName={company?.name}
            unreadNotifications={unreadNotifications}
            appName={appName}
            hasLogo={hasLogo}
          />
          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
