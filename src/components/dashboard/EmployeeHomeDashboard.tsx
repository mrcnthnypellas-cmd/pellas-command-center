'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Wallet, Laptop, FolderOpen, Calendar, MapPin } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { StaticMap } from './StaticMap';
import { AnnouncementCard } from './AnnouncementCard';

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

interface AnnouncementData {
  title: string;
  body: string;
}

export function EmployeeHomeDashboard({ userId }: { userId: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [payslip, setPayslip] = useState<LatestPayslip | null>(null);
  const [announcement, setAnnouncement] = useState<AnnouncementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
      .then((data) => setAnnouncement(data.announcements?.[0] ?? null))
      .catch(() => {});
  }, [loadEvents, loadPayslip]);

  const lastInEvent = [...events].reverse().find((e) => e.type === 'IN');
  const lastOutEvent = [...events].reverse().find((e) => e.type === 'OUT');
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
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
      );
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch {
      // GPS is best-effort; clock event still proceeds without coordinates.
    }

    const res = await fetch('/api/attendance/clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, latitude, longitude, device: navigator.userAgent }),
    });

    setLoading(false);
    if (!res.ok) {
      setError('Could not record attendance. Please try again.');
      return;
    }
    await loadEvents();
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {announcement && <AnnouncementCard title={announcement.title} message={announcement.body} />}

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

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3">
          <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <MapPin className="h-3 w-3" /> Time In Location
          </div>
          <StaticMap
            height={90}
            pins={
              lastInEvent?.latitude != null && lastInEvent.longitude != null
                ? [{ id: lastInEvent.id, label: 'You', type: 'IN', lat: lastInEvent.latitude, lng: lastInEvent.longitude }]
                : []
            }
          />
        </div>
        <div className="card p-3">
          <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <MapPin className="h-3 w-3" /> Time Out Location
          </div>
          <StaticMap
            height={90}
            pins={
              lastOutEvent?.latitude != null && lastOutEvent.longitude != null
                ? [{ id: lastOutEvent.id, label: 'You', type: 'OUT', lat: lastOutEvent.latitude, lng: lastOutEvent.longitude }]
                : []
            }
          />
        </div>
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

      <Link href="/dashboard/calendar" className="card flex items-center gap-3 p-4">
        <Calendar className="h-5 w-5 text-brand-600" />
        <span className="text-sm font-medium text-slate-700">View calendar & announcements</span>
      </Link>

      <p className="sr-only">user:{userId}</p>
    </div>
  );
}
