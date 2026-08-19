'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { Megaphone, CalendarDays } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export interface DigitalAnnouncement {
  id: string;
  title: string;
  body: string | null;
  hasImage: boolean;
  eventDate: string | null;
  createdAt: string;
}

export interface DigitalAnnouncementsCardHandle {
  showAnnouncement: (id: string) => void;
}

export const DigitalAnnouncementsCard = forwardRef<DigitalAnnouncementsCardHandle, { announcements: DigitalAnnouncement[] }>(
  function DigitalAnnouncementsCard({ announcements }, ref) {
    const [index, setIndex] = useState(0);

    useImperativeHandle(ref, () => ({
      showAnnouncement: (id: string) => {
        const i = announcements.findIndex((a) => a.id === id);
        if (i >= 0) setIndex(i);
      },
    }));

    if (announcements.length === 0) {
      return (
        <div className="card p-5">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Megaphone className="h-3.5 w-3.5" /> Digital Announcements
          </div>
          <p className="py-6 text-center text-sm text-slate-400">No announcements right now.</p>
        </div>
      );
    }

    // Safe: the length-0 case already returned above, so an in-range index always exists.
    const current = announcements[Math.min(index, announcements.length - 1)]!;

    return (
      <div className="card overflow-hidden">
        {current.hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/announcements/${current.id}/image`} alt={current.title} className="h-36 w-full object-cover" />
        ) : (
          <div className="flex h-36 w-full items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800">
            <Megaphone className="h-10 w-10 text-white/40" />
          </div>
        )}

        <div className="p-4">
          <div className="flex items-center gap-2">
            <span className="badge bg-red-50 text-red-600">IMPORTANT</span>
            {current.eventDate && (
              <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
                <CalendarDays className="h-3 w-3" /> {formatDate(current.eventDate)}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-900">{current.title}</h3>
          {current.body && <p className="mt-1 text-sm text-slate-600">{current.body}</p>}

          {announcements.length > 1 && (
            <div className="mt-3 flex justify-center gap-1.5">
              {announcements.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show announcement ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? 'w-4 bg-brand-500' : 'w-1.5 bg-slate-600'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
);
