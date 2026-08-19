'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Trash2 } from 'lucide-react';

export function LoginBackgroundSettings({ hasBackground }: { hasBackground: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(hasBackground ? '/api/platform-settings/background' : null);
  const [cacheBust, setCacheBust] = useState(0);

  async function handleFileChange() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/platform-settings/background', { method: 'POST', body: formData });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Upload failed.');
      return;
    }

    setPreviewUrl(`/api/platform-settings/background?v=${Date.now()}`);
    setCacheBust((v) => v + 1);
    if (inputRef.current) inputRef.current.value = '';
    router.refresh();
  }

  async function handleRemove() {
    if (!confirm('Remove the login background image? The login page will fall back to the default gradient.')) return;
    setLoading(true);
    setError(null);
    const res = await fetch('/api/platform-settings/background', { method: 'DELETE' });
    setLoading(false);
    if (res.ok) {
      setPreviewUrl(null);
      router.refresh();
    } else {
      setError('Could not remove background.');
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Login Page Background</h2>
        <p className="mt-1 text-xs text-slate-500">
          Shown behind the sign-in card on the login page for every company on this platform. PNG, JPEG, or
          WebP, up to 8MB.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {previewUrl && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={cacheBust} src={previewUrl} alt="Login background preview" className="h-40 w-full object-cover" />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <label className="btn-secondary cursor-pointer">
          <Upload className="h-4 w-4" />
          {loading ? 'Uploading…' : previewUrl ? 'Change Image' : 'Upload Image'}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
            disabled={loading}
          />
        </label>
        {previewUrl && (
          <button type="button" onClick={handleRemove} disabled={loading} className="btn-secondary text-red-600">
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
