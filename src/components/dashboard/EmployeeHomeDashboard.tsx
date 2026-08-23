'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  Wallet,
  Laptop,
  FolderOpen,
  Calendar,
  MapPin,
  X,
  Clock,
  CalendarCheck,
  AlarmClock,
  ExternalLink,
  FileText,
  Megaphone,
  ShieldAlert,
  Bell,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { distanceMeters } from '@/lib/geo';
import { StaticMap, type MapPin as StaticMapPin } from './StaticMap';
import { DigitalAnnouncementsCard, type DigitalAnnouncement, type DigitalAnnouncementsCardHandle } from './DigitalAnnouncementsCard';

interface ShiftNotice {
  id: string;
  message: string;
}

const SHIFT_TRIGGERS: { id: string; hour: number; minute: number; message: string }[] = [
  { id: 'late', hour: 8, minute: 1, message: "You're late — it's past 8:01 AM and you haven't timed in yet." },
  { id: 'lunch', hour: 12, minute: 0, message: "It's 12:00 NN — lunch break!" },
  { id: 'clockout', hour: 17, minute: 1, message: "It's 5:01 PM — don't forget to time out before you leave." },
];

interface AttendanceEvent {
  id: string;
  type: 'IN' | 'OUT';
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
}

interface LatestPayslip {
  id: string;
  periodStart: string;
  periodEnd: string;
  net: number;
}

interface Geofence {
  lat: number;
  lng: number;
  radiusMeters: number;
}

interface MonthlySummary {
  daysWorked: number;
  lateCount: number;
  attendanceRatePercent: number;
  todayWorkedLabel: string;
}

interface UpcomingCalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  isDeadline: boolean;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const NOTIFICATION_ICON: Record<string, { icon: LucideIcon; className: string }> = {
  NEW_PAYSLIP: { icon: FileText, className: 'bg-emerald-100 text-emerald-600' },
  PAYROLL_DAY: { icon: FileText, className: 'bg-emerald-100 text-emerald-600' },
  DEADLINE_REMINDER: { icon: ShieldAlert, className: 'bg-amber-100 text-amber-600' },
  WARRANTY_EXPIRING: { icon: ShieldAlert, className: 'bg-amber-100 text-amber-600' },
  LOW_INVENTORY: { icon: ShieldAlert, className: 'bg-amber-100 text-amber-600' },
};
const DEFAULT_NOTIFICATION_ICON = { icon: Megaphone, className: 'bg-blue-100 text-blue-600' };

function AttendanceRing({ percent }: { percent: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c - (clamped / 100) * c;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0 -rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" className="stroke-emerald-100" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        className="stroke-emerald-500 transition-[stroke-dashoffset]"
      />
    </svg>
  );
}

function MiniStatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  sublabel,
  ring,
}: {
  icon?: LucideIcon;
  iconClassName?: string;
  label: string;
  value: string | number;
  sublabel?: string;
  ring?: number;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      {ring != null ? (
        <AttendanceRing percent={ring} />
      ) : (
        Icon && (
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', iconClassName)}>
            <Icon className="h-5 w-5" />
          </div>
        )
      )}
      <div className="min-w-0">
        <div className="truncate text-xs text-slate-500">{label}</div>
        <div className="truncate text-xl font-bold text-slate-900">{value}</div>
        {sublabel && <div className="truncate text-[11px] text-slate-400">{sublabel}</div>}
      </div>
    </div>
  );
}

const QUICK_LINKS = [
  { href: '/dashboard/my-attendance', label: 'My Attendance', icon: Clock },
  { href: '/dashboard/my-payslip', label: 'My Payslip', icon: Wallet },
  { href: '/dashboard/my-assets', label: 'My Assets', icon: Laptop },
  { href: '/dashboard/documents', label: 'Documents', icon: FolderOpen },
  { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
  { href: '/dashboard/gov-services', label: 'Gov Services', icon: ExternalLink },
];

export function EmployeeHomeDashboard({ userId, firstName }: { userId: string; firstName: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [payslip, setPayslip] = useState<LatestPayslip | null>(null);
  const [announcements, setAnnouncements] = useState<DigitalAnnouncement[]>([]);
  const [geofence, setGeofence] = useState<Geofence | null>(null);
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingCalendarEvent[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('Asia/Manila');
  const [shiftNotices, setShiftNotices] = useState<ShiftNotice[]>([]);
  const announcementsCardRef = useRef<DigitalAnnouncementsCardHandle>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch('/api/platform-settings')
      .then((res) => res.json())
      .then((data) => data.timezone && setTimezone(data.timezone))
      .catch(() => {});
  }, []);

  // Daily shift reminders (late / lunch / clock-out), computed against the platform
  // timezone so they fire at the right wall-clock moment regardless of the device's
  // own timezone. Each fires once per day (tracked in localStorage) and "late" also
  // auto-clears itself the moment the employee actually times in.
  useEffect(() => {
    if (!now) return;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? -1);
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now); // YYYY-MM-DD
    const seenKey = `pellas_shift_notices_seen_${userId}_${dateStr}`;
    const seen: string[] = JSON.parse((typeof window !== 'undefined' && localStorage.getItem(seenKey)) || '[]');

    const hasTimedInToday = events.some((e) => e.type === 'IN');
    if (hasTimedInToday) {
      setShiftNotices((prev) => prev.filter((n) => n.id !== 'late'));
    }

    for (const trigger of SHIFT_TRIGGERS) {
      if (trigger.id === 'late' && hasTimedInToday) continue; // already timed in — not late
      const due = hour > trigger.hour || (hour === trigger.hour && minute >= trigger.minute);
      if (!due || seen.includes(trigger.id)) continue;

      setShiftNotices((prev) => (prev.some((n) => n.id === trigger.id) ? prev : [...prev, { id: trigger.id, message: trigger.message }]));
      localStorage.setItem(seenKey, JSON.stringify([...seen, trigger.id]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, timezone, userId, events]);

  function dismissNotice(id: string) {
    setShiftNotices((prev) => prev.filter((n) => n.id !== id));
  }

  const loadEvents = useCallback(async () => {
    const res = await fetch('/api/attendance/today');
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events ?? []);
    }
  }, []);

  const loadPayslip = useCallback(async () => {
    const res = await fetch('/api/payslips/latest');
    if (res.ok) {
      const data = await res.json();
      setPayslip(data.payslip ?? null);
    }
  }, []);

  const loadMonthly = useCallback(async () => {
    const res = await fetch('/api/attendance/monthly-summary');
    if (res.ok) setMonthly(await res.json());
  }, []);

  useEffect(() => {
    void loadEvents();
    void loadPayslip();
    void loadMonthly();
    fetch('/api/announcements')
      .then((res) => res.json())
      .then((data) => setAnnouncements(data.announcements ?? []))
      .catch(() => {});
    fetch('/api/attendance/geofence')
      .then((res) => res.json())
      .then((data) => setGeofence(data.geofence ?? null))
      .catch(() => {});
    fetch('/api/calendar')
      .then((res) => res.json())
      .then((data) => {
        const nowMs = Date.now();
        const upcoming = (data.events ?? [])
          .filter((e: { startAt: string }) => new Date(e.startAt).getTime() >= nowMs)
          .slice(0, 3);
        setUpcomingEvents(upcoming);
      })
      .catch(() => {});
    fetch('/api/notifications')
      .then((res) => res.json())
      .then((data) => setNotifications((data.notifications ?? []).slice(0, 4)))
      .catch(() => {});
  }, [loadEvents, loadPayslip, loadMonthly]);

  const lastInEvent = [...events].reverse().find((e) => e.type === 'IN');
  const lastOutEvent = [...events].reverse().find((e) => e.type === 'OUT');

  // StaticMap centers on the first pin only (a real Google Maps embed can't plot
  // multiple markers without a paid API key), so order by most recent first —
  // Time Out beats Time In beats the office fallback.
  const mapPins: StaticMapPin[] = [];
  if (lastOutEvent?.latitude != null && lastOutEvent.longitude != null) {
    mapPins.push({ id: lastOutEvent.id, label: 'You', type: 'OUT', lat: lastOutEvent.latitude, lng: lastOutEvent.longitude });
  }
  if (lastInEvent?.latitude != null && lastInEvent.longitude != null) {
    mapPins.push({ id: lastInEvent.id, label: 'You', type: 'IN', lat: lastInEvent.latitude, lng: lastInEvent.longitude });
  }
  if (geofence) {
    mapPins.push({ id: 'office', label: 'Office', type: 'OFFICE', lat: geofence.lat, lng: geofence.lng });
  }

  const latestPin = lastOutEvent ?? lastInEvent;
  const distanceToOffice =
    geofence && latestPin?.latitude != null && latestPin.longitude != null
      ? Math.round(distanceMeters(latestPin.latitude, latestPin.longitude, geofence.lat, geofence.lng))
      : null;

  const clockedIn = events[events.length - 1]?.type === 'IN';

  const greeting = useMemo(() => {
    if (!now) return 'Hello';
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(now),
    );
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, [now, timezone]);

  async function handleClock(type: 'IN' | 'OUT') {
    setLoading(true);
    setError(null);

    let latitude: number | undefined;
    let longitude: number | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 }),
      );
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch {
      // GPS is best-effort here — if the company requires it, the server will reject
      // the request below with a specific message telling the employee what to do.
    }

    const res = await fetch('/api/attendance/clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, latitude, longitude, device: navigator.userAgent }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not record attendance. Please try again.');
      return;
    }
    await loadEvents();
    await loadMonthly();
  }

  return (
    <div className="space-y-4">
      {shiftNotices.map((n) => (
        <div key={n.id} className="card flex items-center justify-between gap-3 border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-800">{n.message}</p>
          <button
            type="button"
            onClick={() => dismissNotice(n.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded-md p-1 text-amber-600 hover:bg-amber-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {greeting}, {firstName}! 👋
        </h1>
        <p className="text-sm text-slate-500">Here&apos;s what&apos;s happening today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DigitalAnnouncementsCard ref={announcementsCardRef} announcements={announcements} />

        <div className="card space-y-4 p-5 text-center">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Current Time</div>
            <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900">
              {now
                ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: timezone }).format(now)
                : '--:--:--'}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {now ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: timezone }).format(now) : ''}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-200 p-2">
              <div className="text-[10px] font-medium uppercase text-slate-400">Time In</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {lastInEvent ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(lastInEvent.timestamp)) : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <div className="text-[10px] font-medium uppercase text-slate-400">Time Out</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {lastOutEvent ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(lastOutEvent.timestamp)) : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <div className="text-[10px] font-medium uppercase text-slate-400">Status</div>
              <div className="mt-1 text-sm font-semibold text-emerald-600">{clockedIn ? 'Working' : lastOutEvent ? 'Done' : '—'}</div>
            </div>
          </div>

          <p className="text-sm text-slate-600">
            {clockedIn
              ? `You are currently working. Time in at ${new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(lastInEvent!.timestamp))}`
              : 'You have not timed in yet today.'}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled={loading || clockedIn} onClick={() => handleClock('IN')} className="btn-primary py-3 text-base">
              Time In
            </button>
            <button type="button" disabled={loading || !clockedIn} onClick={() => handleClock('OUT')} className="btn-danger py-3 text-base">
              Time Out
            </button>
          </div>
        </div>

        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
              <MapPin className="h-3.5 w-3.5" /> Your Location Today
            </div>
            {distanceToOffice != null && (
              <span
                className={`badge ${
                  geofence && distanceToOffice <= geofence.radiusMeters ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {distanceToOffice}m from office
              </span>
            )}
          </div>
          <StaticMap height={220} pins={mapPins} />
          <p className="mt-2 text-[11px] text-slate-500">
            Showing your most recent {lastOutEvent ? 'Time Out' : 'Time In'} location
            {geofence ? ` · office radius is ${geofence.radiusMeters}m` : ''}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniStatCard icon={Clock} iconClassName="bg-violet-100 text-violet-600" label="Total Working Hours" value={monthly?.todayWorkedLabel ?? '--h --m'} sublabel="Today" />
        <MiniStatCard icon={CalendarCheck} iconClassName="bg-blue-100 text-blue-600" label="Days Worked" value={monthly?.daysWorked ?? 0} sublabel="This Month" />
        <MiniStatCard icon={AlarmClock} iconClassName="bg-amber-100 text-amber-600" label="Late Count" value={monthly?.lateCount ?? 0} sublabel="This Month" />
        <MiniStatCard ring={monthly?.attendanceRatePercent ?? 0} label="Attendance Rate" value={`${monthly?.attendanceRatePercent ?? 0}%`} sublabel="This Month" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Upcoming Events</h2>
            <Link href="/dashboard/calendar" className="text-xs font-medium text-brand-600 hover:underline">
              View Calendar
            </Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-slate-500">No upcoming events.</p>
          ) : (
            <ul className="space-y-3">
              {upcomingEvents.map((e) => {
                const d = new Date(e.startAt);
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-slate-200 py-1">
                        <span className="text-[9px] font-semibold uppercase text-slate-400">
                          {new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d)}
                        </span>
                        <span className="text-sm font-bold text-slate-900">{d.getDate()}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{e.title}</div>
                        <div className="text-xs text-slate-500">
                          {new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(d)}
                          {e.endAt ? ` - ${new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(e.endAt))}` : ''}
                        </div>
                      </div>
                    </div>
                    <span className={cn('badge shrink-0', e.isDeadline ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700')}>
                      {e.isDeadline ? 'Important' : 'Event'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Quick Links</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-4 text-center hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <link.icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium text-slate-700">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
            <Link href="/dashboard/my-attendance" className="text-xs font-medium text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500">No notifications yet.</p>
          ) : (
            <ul className="space-y-3">
              {notifications.map((n) => {
                const { icon: Icon, className } = NOTIFICATION_ICON[n.type] ?? DEFAULT_NOTIFICATION_ICON;
                return (
                  <li key={n.id} className="flex items-start gap-3">
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', className)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm text-slate-700">{n.title}</div>
                      <div className="text-[11px] text-slate-400">{timeAgo(n.createdAt)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {payslip && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Latest Payslip</h2>
            <p className="text-xs text-slate-500">
              {formatDate(payslip.periodStart)} – {formatDate(payslip.periodEnd)}
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(payslip.net)}
            </p>
          </div>
          <Link href="/dashboard/my-payslip" className="btn-primary">
            View Payslip
          </Link>
        </div>
      )}

      <p className="sr-only" aria-hidden="true">
        <Bell className="hidden" />
        user:{userId}
      </p>
    </div>
  );
}
