'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Month-grid calendar. `markedDates` keys are 'YYYY-M-D' (local) — dates with an
 * announcement linked via Announcement.eventDate get a dot marker; clicking one
 * calls onSelectMarkedDate so the caller can jump to that announcement. */
export function MiniCalendar({
  markedDates,
  onSelectMarkedDate,
}: {
  markedDates: Map<string, string>; // dateKey -> announcement id
  onSelectMarkedDate?: (announcementId: string) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const days = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [cursor]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-100"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-100"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-slate-400">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = toDateKey(d);
          const isToday = key === toDateKey(today);
          const markedId = markedDates.get(key);
          return (
            <button
              key={key}
              type="button"
              disabled={!markedId}
              onClick={() => markedId && onSelectMarkedDate?.(markedId)}
              className={`relative aspect-square rounded-md text-xs ${
                isToday
                  ? 'bg-brand-600 font-semibold text-white'
                  : markedId
                    ? 'font-medium text-brand-700 hover:bg-brand-50'
                    : 'text-slate-600'
              }`}
            >
              {d.getDate()}
              {markedId && !isToday && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
