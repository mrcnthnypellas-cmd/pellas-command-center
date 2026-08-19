import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { Role } from '@prisma/client';

// Coarse route-group gate. This is a first line of defense only — the real
// enforcement is the requireAbility()/withCompanyScope() checks inside each
// API route and server action (spec §6: never trust client/middleware alone).
const ROLE_ROUTE_PREFIXES: Partial<Record<Role, string[]>> = {
  IT_ADMIN: ['/dashboard/payroll', '/dashboard/payslips'],
  EMPLOYEE: ['/dashboard/employees', '/dashboard/clients', '/dashboard/it-assets/admin'],
  CLIENT: ['/dashboard'], // clients only ever see /portal/*
};

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    if (!token) return NextResponse.next();

    const role = token.role as Role;

    if (role === 'CLIENT' && path.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/portal', req.url));
    }
    if (role !== 'CLIENT' && path.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    const deniedPrefixes = ROLE_ROUTE_PREFIXES[role]?.filter((p) => p !== '/dashboard') ?? [];
    if (deniedPrefixes.some((prefix) => path.startsWith(prefix))) {
      return NextResponse.redirect(new URL('/dashboard?denied=1', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: '/login' },
  },
);

export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*'],
};
