'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function NewAnnouncementForm({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not post announcement.');
      return;
    }

    (document.getElementById('new-announcement-form') as HTMLFormElement | null)?.reset();
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
        <label className="label">Message</label>
        <textarea name="body" required rows={3} className="input" />
      </div>

      {isSuperAdmin && (
        <p className="text-xs text-slate-500">
          Posted as Super Admin — this will be visible on every company&apos;s dashboard.
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? 'Posting…' : 'Post Announcement'}
      </button>
    </form>
  );
}
