'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ZOOM_OPTIONS = [25, 50, 75, 90, 100, 110, 125, 150];

export function ZoomSettings({ currentZoom }: { currentZoom: number }) {
  const router = useRouter();
  const [zoom, setZoom] = useState(currentZoom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(value: number) {
    setZoom(value);
    setLoading(true);
    setError(null);
    setSaved(false);
    const res = await fetch('/api/platform-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoomPercent: String(value) }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not save zoom.');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Page Zoom</h2>
        <p className="mt-1 text-xs text-slate-500">
          Overall size of the login page and every dashboard. 100% is normal size.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Zoom updated.</div>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Zoom level</label>
          <select
            value={zoom}
            onChange={(e) => handleSave(Number(e.target.value))}
            disabled={loading}
            className="input"
          >
            {ZOOM_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}% {v === 100 ? '(normal / default)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
