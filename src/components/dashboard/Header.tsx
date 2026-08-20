'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { LogOut, Search, ChevronDown } from 'lucide-react';
import type { Role } from '@prisma/client';
import { MobileNav } from './MobileNav';
import { NotificationBell } from './NotificationBell';
import { LiveClock } from './LiveClock';
import { roleLabel } from '@/lib/utils';

export function Header({
  role,
  firstName,
  lastName,
  companyName,
  unreadNotifications,
  appName,
  hasLogo,
}: {
  role: Role;
  firstName: string;
  lastName: string;
  companyName?: string;
  unreadNotifications: number;
  appName?: string;
  hasLogo?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNav
          role={role}
          companyName={companyName}
          firstName={firstName}
          lastName={lastName}
          appName={appName}
          hasLogo={hasLogo}
        />
        <LiveClock variant="compact" />
        <div className="relative hidden w-64 lg:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search here..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <NotificationBell initialUnreadCount={unreadNotifications} />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 hover:bg-slate-100"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {firstName[0]}
              {lastName[0]}
            </div>
            <div className="hidden text-left leading-tight sm:block">
              <div className="text-sm font-medium text-slate-900">{companyName ?? roleLabel(role)}</div>
              <div className="text-[11px] text-slate-500">
                {firstName} {lastName}
              </div>
            </div>
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 z-40 mt-2 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
