'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { Wallet, Laptop, FolderOpen, Calendar, MapPin, X } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { distanceMeters } from '@/lib/geo';
import { StaticMap, type MapPin as StaticMapPin } from './StaticMap';
import { DigitalAnnouncementsCard, type DigitalAnnouncement, type DigitalAnnouncementsCardHandle } from './DigitalAnnouncementsCard';
import { MiniCalendar } from './MiniCalendar';

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

// eventDate is a date-only value stored as UTC midnight (spec-established convention
// for date-only fields in this app) — must read it back with UTC getters, or it shifts
// a day earlier for any browser west of UTC.
function dateKeyFromISO(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

export function EmployeeHomeDashboard({ userId }: { userId: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [payslip, setPayslip] = useState<LatestPayslip | null>(null);
  const [announcements, setAnnouncements] = useState<DigitalAnnouncement[]>([]);
  const [geofence, setGeofence] = useState<Geofence | null>(null);
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

  useEffect(() => {
    void loadEvents();
    void loadPayslip();
    fetch('/api/announcements')
      .then((res) => res.json())
      .then((data) => setAnnouncements(data.announcements ?? []))
      .catch(() => {});
    fetch('/api/attendance/geofence')
      .then((res) => res.json())
      .then((data) => setGeofence(data.geofence ?? null))
      .catch(() => {});
  }, [loadEvents, loadPayslip]);

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
  const markedDates = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of announcements) {
      if (a.eventDate) map.set(dateKeyFromISO(a.eventDate), a.id);
    }
    return map;
  }, [announcements]);

  const clockedIn = events[events.length - 1]?.type === 'IN';
  const totalHours =
    lastInEvent && lastOutEvent && new Date(lastOutEvent.timestamp) > new Date(lastInEvent.timestamp)
      ? ((new Date(lastOutEvent.timestamp).getTime() - new Date(lastInEvent.timestamp).getTime()) / 3600000).toFixed(1)
      : null;

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
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
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

      <DigitalAnnouncementsCard ref={announcementsCardRef} announcements={announcements} />

      <div className="card p-6 text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Current Time</div>
        <div className="mt-1 font-mono text-4xl font-bold tabular-nums text-slate-900">
          {now
            ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(
                now,
              )
            : '--:--:--'}
        </div>
        <div className="mt-1 text-sm text-slate-500">{now ? formatDate(now) : ''}</div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <div className="text-[10px] font-medium uppercase text-slate-400">Time In</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {lastInEvent ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(lastInEvent.timestamp)) : '—'}
          </div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-[10px] font-medium uppercase text-slate-400">Time Out</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {lastOutEvent ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(lastOutEvent.timestamp)) : '—'}
          </div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-[10px] font-medium uppercase text-slate-400">Status</div>
          <div className="mt-1 text-sm font-semibold text-emerald-600">{clockedIn ? 'Working' : totalHours ? 'Done' : '—'}</div>
        </div>
      </div>

      <div className="card p-5 text-center">
        <p className="text-sm text-slate-600">
          {clockedIn
            ? `You are currently working. Time in at ${new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(lastInEvent!.timestamp))}`
            : 'You have not timed in yet today.'}
        </p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={loading || clockedIn}
            onClick={() => handleClock('IN')}
            className="btn-primary py-3 text-base"
          >
            Time In
          </button>
          <button
            type="button"
            disabled={loading || !clockedIn}
            onClick={() => handleClock('OUT')}
            className="btn-danger py-3 text-base"
          >
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
                geofence && distanceToOffice <= geofence.radiusMeters
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'
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

      <div className="card p-5">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Latest Payslip</h2>
        {payslip ? (
          <>
            <p className="text-xs text-slate-500">
              {formatDate(payslip.periodStart)} – {formatDate(payslip.periodEnd)}
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(payslip.net)}
            </p>
            <Link href="/dashboard/my-payslip" className="btn-primary mt-3 w-full">
              View Payslip
            </Link>
          </>
        ) : (
          <p className="text-sm text-slate-500">No payslip issued yet.</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link href="/dashboard/my-payslip" className="card flex flex-col items-center gap-1.5 p-4 text-center">
          <Wallet className="h-5 w-5 text-brand-600" />
          <span className="text-xs font-medium text-slate-700">Payslip</span>
        </Link>
        <Link href="/dashboard/my-assets" className="card flex flex-col items-center gap-1.5 p-4 text-center">
          <Laptop className="h-5 w-5 text-brand-600" />
          <span className="text-xs font-medium text-slate-700">Assets</span>
        </Link>
        <Link href="/dashboard/documents" className="card flex flex-col items-center gap-1.5 p-4 text-center">
          <FolderOpen className="h-5 w-5 text-brand-600" />
          <span className="text-xs font-medium text-slate-700">Documents</span>
        </Link>
      </div>

      <div className="card p-4">
        <MiniCalendar
          markedDates={markedDates}
          onSelectMarkedDate={(id) => announcementsCardRef.current?.showAnnouncement(id)}
        />
      </div>

      <Link href="/dashboard/calendar" className="card flex items-center gap-3 p-4">
        <Calendar className="h-5 w-5 text-brand-600" />
        <span className="text-sm font-medium text-slate-700">View full calendar</span>
      </Link>

      <p className="sr-only">user:{userId}</p>
    </div>
  );
}
