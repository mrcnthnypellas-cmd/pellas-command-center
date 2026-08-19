'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Common IANA timezones relevant to this app's business context, plus a few widely
// used references. Any valid IANA name works — this list is just a convenient picker.
const TIMEZONES = [
  { value: 'Asia/Manila', label: 'Philippine Time (Asia/Manila, UTC+8)' },
  { value: 'Asia/Singapore', label: 'Singapore Time (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong Time (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Japan Time (UTC+9)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/Los_Angeles', label: 'US Pacific Time' },
  { value: 'America/New_York', label: 'US Eastern Time' },
];

export function TimezoneSettings({ currentTimezone }: { currentTimezone: string }) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(currentTimezone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSaved(false);

    const res = await fetch('/api/platform-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not save timezone.');
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">System Date &amp; Time</h2>
        <p className="mt-1 text-xs text-slate-500">
          Controls the timezone used for the live clock shown on every dashboard header.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Timezone updated.</div>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Timezone</label>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input">
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={handleSave} disabled={loading} className="btn-primary">
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
