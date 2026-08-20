'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const DEFAULT_PRIMARY = '#3b63f5';
const DEFAULT_BACKGROUND = '#0b0f21';

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter (default)' },
  { value: 'System Default', label: 'System Default' },
  { value: 'Georgia', label: 'Georgia (serif)' },
  { value: 'Monospace', label: 'Monospace' },
];

interface Props {
  currentPrimary: string | null;
  currentBackground: string | null;
  currentFont: string | null;
}

export function ThemeSettings({ currentPrimary, currentBackground, currentFont }: Props) {
  const router = useRouter();
  const [primary, setPrimary] = useState(currentPrimary ?? DEFAULT_PRIMARY);
  const [background, setBackground] = useState(currentBackground ?? DEFAULT_BACKGROUND);
  const [font, setFont] = useState(currentFont ?? 'Inter');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(values: { themePrimaryColor?: string | null; themeBackgroundColor?: string | null; themeFontFamily?: string | null }) {
    setLoading(true);
    setError(null);
    setSaved(false);
    const res = await fetch('/api/platform-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not save theme.');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  function handleSave() {
    void save({ themePrimaryColor: primary, themeBackgroundColor: background, themeFontFamily: font });
  }

  function handleReset() {
    setPrimary(DEFAULT_PRIMARY);
    setBackground(DEFAULT_BACKGROUND);
    setFont('Inter');
    void save({ themePrimaryColor: null, themeBackgroundColor: null, themeFontFamily: null });
  }

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Dashboard Theme</h2>
        <p className="mt-1 text-xs text-slate-500">
          Pick a primary color, background color, and font — the rest of the palette (cards, borders, hover
          states) is balanced automatically from these. Applies to every dashboard except the Client Portal.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Theme updated.</div>}

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Primary / accent color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 p-1"
            />
            <span className="font-mono text-xs text-slate-500">{primary}</span>
          </div>
        </div>

        <div>
          <label className="label">Background color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 p-1"
            />
            <span className="font-mono text-xs text-slate-500">{background}</span>
          </div>
        </div>

        <div>
          <label className="label">Font</label>
          <select value={font} onChange={(e) => setFont(e.target.value)} className="input">
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="rounded-xl border p-4"
        style={{ backgroundColor: background, borderColor: 'rgba(148,163,184,0.2)', fontFamily: font === 'Monospace' ? 'monospace' : font === 'Georgia' ? 'Georgia, serif' : font === 'System Default' ? 'system-ui' : 'inherit' }}
      >
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">Preview</p>
        <button
          type="button"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: primary }}
        >
          Primary button
        </button>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={handleSave} disabled={loading} className="btn-primary">
          {loading ? 'Saving…' : 'Save theme'}
        </button>
        <button type="button" onClick={handleReset} disabled={loading} className="btn-secondary">
          Reset to default
        </button>
      </div>
    </div>
  );
}
