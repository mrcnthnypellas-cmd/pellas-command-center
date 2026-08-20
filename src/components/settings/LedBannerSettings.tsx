'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fontFamilyCss } from '@/lib/theme';

const FONT_OPTIONS = ['Inter', 'System Default', 'Georgia', 'Monospace'] as const;
const SPEED_OPTIONS: { value: number; label: string }[] = [
  { value: 10, label: 'Very Fast' },
  { value: 15, label: 'Fast' },
  { value: 20, label: 'Normal (default)' },
  { value: 30, label: 'Slow' },
  { value: 45, label: 'Very Slow' },
  { value: 60, label: 'Slowest' },
];
const HEIGHT_OPTIONS = [32, 40, 48, 56, 64, 72] as const;

export interface BannerSettingValues {
  bannerEnabled: boolean;
  bannerMessage: string;
  bannerTextColor: string;
  bannerBackgroundColor: string;
  bannerFontFamily: string | null;
  bannerSpeedSeconds: number;
  bannerHeight: number;
}

export function LedBannerSettings({ current }: { current: BannerSettingValues }) {
  const router = useRouter();
  const [values, setValues] = useState<BannerSettingValues>(current);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof BannerSettingValues>(key: K, value: BannerSettingValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const res = await fetch('/api/platform-settings/banner', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bannerEnabled: values.bannerEnabled,
        bannerMessage: values.bannerMessage,
        bannerTextColor: values.bannerTextColor,
        bannerBackgroundColor: values.bannerBackgroundColor,
        bannerFontFamily: values.bannerFontFamily,
        bannerSpeedSeconds: String(values.bannerSpeedSeconds),
        bannerHeight: String(values.bannerHeight),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not save the banner.');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">LED Banner</h2>
        <p className="mt-1 text-xs text-slate-500">
          Scrolling message bar at the top of every dashboard. Visible to everyone once enabled.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Banner saved.</div>}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={values.bannerEnabled}
          onChange={(e) => update('bannerEnabled', e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Show the banner on every dashboard
      </label>

      <div>
        <label className="label">Message</label>
        <textarea
          value={values.bannerMessage}
          onChange={(e) => update('bannerMessage', e.target.value)}
          maxLength={500}
          rows={2}
          className="input"
          placeholder="e.g. Reminder: submit your timesheets before Friday 5PM."
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="label">Text color</label>
          <input
            type="color"
            value={values.bannerTextColor}
            onChange={(e) => update('bannerTextColor', e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200"
          />
        </div>
        <div>
          <label className="label">Background color</label>
          <input
            type="color"
            value={values.bannerBackgroundColor}
            onChange={(e) => update('bannerBackgroundColor', e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200"
          />
        </div>
        <div>
          <label className="label">Font</label>
          <select
            value={values.bannerFontFamily ?? 'Inter'}
            onChange={(e) => update('bannerFontFamily', e.target.value)}
            className="input"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Animation speed</label>
          <select
            value={values.bannerSpeedSeconds}
            onChange={(e) => update('bannerSpeedSeconds', Number(e.target.value))}
            className="input"
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Bar height</label>
        <select
          value={values.bannerHeight}
          onChange={(e) => update('bannerHeight', Number(e.target.value))}
          className="input max-w-[160px]"
        >
          {HEIGHT_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {h}px
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Preview</label>
        <div
          className="relative w-full overflow-hidden rounded-lg"
          style={{ backgroundColor: values.bannerBackgroundColor, height: values.bannerHeight }}
        >
          <div
            className="led-banner-scroll absolute inset-y-0 left-0 flex items-center whitespace-nowrap"
            style={{
              color: values.bannerTextColor,
              fontFamily: fontFamilyCss(values.bannerFontFamily),
              animationDuration: `${values.bannerSpeedSeconds}s`,
            }}
          >
            <span className="px-8 text-sm font-semibold tracking-wide">
              {values.bannerMessage || 'Your message will scroll here'}
            </span>
            <span className="px-8 text-sm font-semibold tracking-wide" aria-hidden="true">
              {values.bannerMessage || 'Your message will scroll here'}
            </span>
          </div>
        </div>
      </div>

      <button type="button" onClick={handleSave} disabled={loading} className="btn-primary">
        {loading ? 'Saving…' : 'Save Banner'}
      </button>
    </div>
  );
}
