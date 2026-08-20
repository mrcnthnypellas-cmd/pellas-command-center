'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Trash2 } from 'lucide-react';

export function BrandingSettings({ currentAppName, hasLogo }: { currentAppName: string; hasLogo: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [appName, setAppName] = useState(currentAppName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(hasLogo ? '/api/platform-settings/logo' : null);
  const [cacheBust, setCacheBust] = useState(0);

  async function handleSaveName() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const res = await fetch('/api/platform-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not save app name.');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function handleLogoChange() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/platform-settings/logo', { method: 'POST', body: formData });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Upload failed.');
      return;
    }
    setPreviewUrl(`/api/platform-settings/logo?v=${Date.now()}`);
    setCacheBust((v) => v + 1);
    if (inputRef.current) inputRef.current.value = '';
    router.refresh();
  }

  async function handleRemoveLogo() {
    if (!confirm('Remove the logo? The sidebar and login page will fall back to the default badge.')) return;
    setLoading(true);
    setError(null);
    const res = await fetch('/api/platform-settings/logo', { method: 'DELETE' });
    setLoading(false);
    if (res.ok) {
      setPreviewUrl(null);
      router.refresh();
    } else {
      setError('Could not remove logo.');
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">App Name &amp; Logo</h2>
        <p className="mt-1 text-xs text-slate-500">
          Shown on the login page and dashboard sidebar for every company on this platform.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">App name updated.</div>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">App name</label>
          <input value={appName} onChange={(e) => setAppName(e.target.value)} maxLength={80} className="input" />
        </div>
        <button type="button" onClick={handleSaveName} disabled={loading || !appName.trim()} className="btn-primary">
          {loading ? 'Saving…' : 'Save name'}
        </button>
      </div>

      <div className="border-t border-slate-200 pt-4">
        {previewUrl && (
          <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={cacheBust} src={previewUrl} alt="Logo preview" className="h-full w-full object-contain" />
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <label className="btn-secondary cursor-pointer">
            <Upload className="h-4 w-4" />
            {loading ? 'Uploading…' : previewUrl ? 'Change Logo' : 'Upload Logo'}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleLogoChange}
              disabled={loading}
            />
          </label>
          {previewUrl && (
            <button type="button" onClick={handleRemoveLogo} disabled={loading} className="btn-secondary text-red-600">
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
