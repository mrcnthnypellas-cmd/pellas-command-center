'use client';

import { useState } from 'react';
import type { Role } from '@prisma/client';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';

export function MobileNav({
  role,
  companyName,
  firstName,
  lastName,
  appName,
  hasLogo,
}: {
  role: Role;
  companyName?: string;
  firstName: string;
  lastName: string;
  appName?: string;
  hasLogo?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Open navigation menu"
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative z-10 h-full w-72 max-w-[85vw] shadow-xl">
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-navy-200 hover:bg-navy-700"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar
              role={role}
              companyName={companyName}
              firstName={firstName}
              lastName={lastName}
              appName={appName}
              hasLogo={hasLogo}
              className="h-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
