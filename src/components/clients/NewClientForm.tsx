'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function NewClientForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not create client.');
      return;
    }

    const data = await res.json();
    setCreatedPassword(data.tempPassword);
    router.refresh();
  }

  if (createdPassword) {
    return (
      <div className="card space-y-3 p-6">
        <h2 className="text-base font-semibold text-emerald-700">Client created</h2>
        <p className="text-sm text-slate-600">Temporary password (share securely, shown once):</p>
        <div className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm">{createdPassword}</div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setCreatedPassword(null);
            setOpen(false);
          }}
        >
          Done
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        New Client
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-6">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">First name</label>
          <input name="firstName" required className="input" />
        </div>
        <div>
          <label className="label">Last name</label>
          <input name="lastName" required className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input name="phone" className="input" />
        </div>
        <div>
          <label className="label">Client code</label>
          <input name="clientCode" required className="input" />
        </div>
        <div>
          <label className="label">Business name</label>
          <input name="businessName" className="input" />
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Creating…' : 'Create client'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
