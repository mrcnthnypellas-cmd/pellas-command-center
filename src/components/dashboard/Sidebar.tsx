'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@prisma/client';
import { ChevronDown } from 'lucide-react';
import { navForRole } from '@/lib/navigation';
import { cn, roleLabel } from '@/lib/utils';

export function Sidebar({
  role,
  companyName,
  firstName,
  lastName,
  appName = 'My Pellas Command Center',
  hasLogo = false,
  className,
}: {
  role: Role;
  companyName?: string;
  firstName: string;
  lastName: string;
  appName?: string;
  hasLogo?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const items = navForRole(role);
  const [logoOk, setLogoOk] = useState(hasLogo);

  return (
    <nav className={cn('flex h-full flex-col bg-navy-800 text-navy-100', className)}>
      <div className="flex items-center gap-2.5 px-4 py-5">
        {logoOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/api/platform-settings/logo"
            alt={appName}
            onError={() => setLogoOk(false)}
            className="h-9 w-9 shrink-0 rounded-lg object-contain"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
            {appName.trim()[0]?.toUpperCase() ?? 'P'}
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold text-white">{appName}</div>
        </div>
      </div>

      {companyName && (
        <div className="mx-3 mb-3 flex items-center justify-between gap-2 rounded-lg bg-navy-700 px-3 py-2 text-xs">
          <span className="truncate font-medium text-navy-100">{companyName}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-navy-300" />
        </div>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {items.map((item) => {
          // Exact match for the root dashboard/portal links — otherwise every nested
          // route (which all live under /dashboard/*) would also light up "Dashboard".
          const isRootLink = item.href === '/dashboard' || item.href === '/portal';
          const active = isRootLink
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-brand-500 text-white shadow-sm' : 'text-navy-200 hover:bg-navy-700 hover:text-white',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2.5 border-t border-navy-700 px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
          {firstName[0]}
          {lastName[0]}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-medium text-white">
            {firstName} {lastName}
          </div>
          <div className="truncate text-[11px] text-navy-300">{roleLabel(role)}</div>
        </div>
      </div>
    </nav>
  );
}
