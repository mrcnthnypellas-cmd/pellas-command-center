import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Availability, DB } from '../lib/types';
import { cx, todayYMD } from '../lib/utils';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthGrid({
  month,
  onMonth,
  selected,
  onSelect,
  dayInfo,
  renderDay,
  minMonth,
}: {
  month: Date;
  onMonth: (d: Date) => void;
  selected?: string;
  onSelect: (ymd: string) => void;
  dayInfo?: (ymd: string, date: Date) => { disabled?: boolean; tone?: 'muted' | 'blocked' };
  renderDay?: (ymd: string, date: Date) => ReactNode;
  minMonth?: Date;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const today = todayYMD();
  const canPrev = !minMonth || first > new Date(minMonth.getFullYear(), minMonth.getMonth(), 1);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" disabled={!canPrev} onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-30" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-display text-sm font-semibold text-white">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        <button type="button" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {DOW.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const ymd = todayYMD(d);
          const inMonth = d.getMonth() === month.getMonth();
          const info = dayInfo?.(ymd, d) ?? {};
          const isSel = selected === ymd;
          return (
            <button
              key={ymd}
              type="button"
              disabled={info.disabled}
              onClick={() => onSelect(ymd)}
              className={cx(
                'relative flex min-h-[44px] flex-col items-center justify-start rounded-lg p-1 text-sm transition',
                !inMonth && 'opacity-35',
                info.disabled ? 'cursor-not-allowed text-slate-600' : 'text-slate-200 hover:bg-white/5',
                info.tone === 'blocked' && 'bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.04)_4px,rgba(255,255,255,0.04)_8px)]',
                isSel && 'bg-gold-400/20 text-gold-50 ring-1 ring-gold-400/60 hover:bg-gold-400/25',
                ymd === today && !isSel && 'ring-1 ring-white/20',
              )}
              aria-pressed={isSel}
              aria-label={d.toDateString()}
            >
              <span className="tabular-nums">{d.getDate()}</span>
              {renderDay?.(ymd, d)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function slotsFor(av: Availability, duration: number) {
  const out: string[] = [];
  for (let m = toMin(av.start); m + duration <= toMin(av.end); m += av.slotMinutes) out.push(toHHMM(m));
  return out;
}

export function dayAvailability(db: DB, ymd: string, date: Date) {
  const av = db.availability;
  const blackout = av.blackoutDates.find((b) => b.date === ymd);
  const closedDay = !av.workingDays.includes(date.getDay());
  const minDate = new Date(Date.now() + av.leadTimeHours * 3600_000);
  const past = new Date(`${ymd}T23:59`) < minDate;
  return { blackout, closedDay, past, bookable: !blackout && !closedDay && !past };
}

/** Slot is unavailable if it is inside the lead time window or overlaps an active booking. */
export function slotState(db: DB, ymd: string, time: string, duration: number, ignoreId?: string): 'open' | 'taken' | 'past' {
  const start = new Date(`${ymd}T${time}`);
  if (start.getTime() < Date.now() + db.availability.leadTimeHours * 3600_000) return 'past';
  const s = toMin(time);
  const e = s + duration;
  const overlapping = db.appointments.filter((a) => a.id !== ignoreId && a.date === ymd && !['Cancelled', 'Completed'].includes(a.status) && toMin(a.time) < e && toMin(a.time) + a.duration > s);
  return overlapping.length >= db.availability.maxPerSlot ? 'taken' : 'open';
}
