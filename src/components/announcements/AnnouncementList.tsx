'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/utils';

interface AnnouncementRow {
  id: string;
  title: string;
  body: string | null;
  hasImage: boolean;
  eventDate: string | null;
  isActive: boolean;
  scope: 'Platform-wide' | 'This company';
  createdAt: string;
  createdBy: string;
}

export function AnnouncementList({ announcements }: { announcements: AnnouncementRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(id: string, isActive: boolean) {
    setBusyId(id);
    await fetch(`/api/announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    setBusyId(null);
    router.refresh();
  }

  if (announcements.length === 0) {
    return <div className="card p-8 text-center text-sm text-slate-500">No announcements yet.</div>;
  }

  return (
    <div className="card divide-y divide-slate-100">
      {announcements.map((a) => (
        <div key={a.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="flex items-start gap-3">
            {a.hasImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/announcements/${a.id}/image`}
                alt=""
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{a.title}</span>
                <span className="badge bg-slate-100 text-slate-600">{a.scope}</span>
                {!a.isActive && <span className="badge bg-slate-100 text-slate-500">Inactive</span>}
                {a.eventDate && (
                  <span className="badge flex items-center gap-1 bg-brand-50 text-brand-700">
                    <CalendarDays className="h-3 w-3" /> {formatDate(a.eventDate)}
                  </span>
                )}
              </div>
              {a.body && <p className="mt-0.5 text-sm text-slate-600">{a.body}</p>}
              <p className="mt-1 text-xs text-slate-400">
                {a.createdBy} · {formatDateTime(a.createdAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busyId === a.id}
            onClick={() => toggle(a.id, !a.isActive)}
            className="btn-secondary shrink-0 py-1.5 text-xs"
          >
            {a.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      ))}
    </div>
  );
}
