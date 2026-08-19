'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

// Without this boundary, a thrown ForbiddenError (e.g. an Employee hitting an
// admin-only URL directly) crashes the whole React tree into a dead state instead
// of showing a clean message — this catches that and any other page-level error.
export default function DashboardError({ error }: { error: Error & { digest?: string } }) {
  const isForbidden = error.message?.includes('denied') || error.name === 'ForbiddenError';

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold text-slate-900">
        {isForbidden ? 'Access Denied' : 'Something went wrong'}
      </h1>
      <p className="max-w-sm text-sm text-slate-500">
        {isForbidden
          ? "You don't have permission to view this page."
          : 'An unexpected error occurred while loading this page.'}
      </p>
      <Link href="/dashboard" className="btn-primary mt-2">
        Back to Dashboard
      </Link>
    </div>
  );
}
