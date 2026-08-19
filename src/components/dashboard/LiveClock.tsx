'use client';

import { useEffect, useState } from 'react';

/**
 * Shared live clock/date, shown in the header for every role. Fetches the
 * Super-Admin-configured platform timezone once on mount (defaults to Asia/Manila
 * while loading) so the displayed time matches business hours regardless of which
 * timezone the server or the viewer's browser happens to be in.
 */
export function LiveClock({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const [now, setNow] = useState<Date | null>(null);
  const [timezone, setTimezone] = useState('Asia/Manila');

  useEffect(() => {
    fetch('/api/platform-settings')
      .then((res) => res.json())
      .then((data) => setTimezone(data.timezone ?? 'Asia/Manila'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) return null;

  const dateStr = new Intl.DateTimeFormat('en-PH', {
    timeZone: timezone,
    weekday: variant === 'full' ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
    year: variant === 'full' ? 'numeric' : undefined,
  }).format(now);

  const timeStr = new Intl.DateTimeFormat('en-PH', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    second: variant === 'full' ? '2-digit' : undefined,
  }).format(now);

  return (
    <div className={variant === 'full' ? 'text-sm text-slate-600' : 'text-xs text-slate-500'}>
      <span className="font-medium text-slate-900">{dateStr}</span>
      <span className="mx-1.5 text-slate-300">·</span>
      <span className="font-mono tabular-nums">{timeStr}</span>
    </div>
  );
}
