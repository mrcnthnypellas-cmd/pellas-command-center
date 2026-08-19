import { CalendarClock } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { CalendarEvent } from '@prisma/client';

export function UpcomingEvents({ events }: { events: CalendarEvent[] }) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-900">Upcoming Calendar</h2>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-slate-500">No upcoming events.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {events.map((event) => (
            <li key={event.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <div className="font-medium text-slate-900">{event.title}</div>
                {event.department && <div className="text-xs text-slate-500">{event.department}</div>}
              </div>
              <div className="flex items-center gap-2">
                {event.isDeadline && (
                  <span className="badge bg-red-50 text-red-700">Deadline</span>
                )}
                <span className="text-slate-500">{formatDate(event.startAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
