'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, X } from 'lucide-react';

export function NewAnnouncementForm({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageName, setImageName] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    // Drop empty optional fields rather than sending them as empty strings.
    if (!(form.get('body') as string)?.trim()) form.delete('body');
    if (!(form.get('eventDate') as string)?.trim()) form.delete('eventDate');
    if (!(form.get('image') as File)?.size) form.delete('image');

    const res = await fetch('/api/announcements', { method: 'POST', body: form });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not post announcement.');
      return;
    }

    (document.getElementById('new-announcement-form') as HTMLFormElement | null)?.reset();
    setImageName(null);
    router.refresh();
  }

  return (
    <form id="new-announcement-form" onSubmit={handleSubmit} className="card space-y-4 p-6">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div>
        <label className="label">Title</label>
        <input name="title" required placeholder="e.g. Today is Payroll Day" className="input" />
      </div>
      <div>
        <label className="label">Message {isSuperAdmin && '(optional if you attach an image)'}</label>
        <textarea name="body" required={!isSuperAdmin} rows={3} className="input" />
      </div>

      {isSuperAdmin && (
        <>
          <div>
            <label className="label">Link to a calendar date (optional)</label>
            <input name="eventDate" type="date" className="input" />
            <p className="mt-1 text-xs text-slate-500">Shown as a marker on the Calendar widget.</p>
          </div>

          <div>
            <label className="label">Or attach an image instead of typing (JPEG/PNG, optional)</label>
            <label
              htmlFor="announcement-image"
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600"
            >
              <ImagePlus className="h-4 w-4" />
              {imageName ?? 'Choose an image…'}
            </label>
            <input
              id="announcement-image"
              name="image"
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => setImageName(e.target.files?.[0]?.name ?? null)}
            />
            {imageName && (
              <button
                type="button"
                onClick={() => {
                  setImageName(null);
                  const input = document.getElementById('announcement-image') as HTMLInputElement | null;
                  if (input) input.value = '';
                }}
                className="mt-1.5 flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"
              >
                <X className="h-3 w-3" /> Remove image
              </button>
            )}
          </div>

          <p className="text-xs text-slate-500">
            Posted as Super Admin — this will be visible on every company&apos;s dashboard.
          </p>
        </>
      )}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? 'Posting…' : 'Post Announcement'}
      </button>
    </form>
  );
}
