'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function NewAssetForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not create asset.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        New Asset
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-6">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Asset tag</label>
          <input name="assetTag" required className="input" />
        </div>
        <div>
          <label className="label">Category</label>
          <input name="category" required placeholder="Laptop, Monitor, Phone…" className="input" />
        </div>
        <div>
          <label className="label">Brand</label>
          <input name="brand" className="input" />
        </div>
        <div>
          <label className="label">Model</label>
          <input name="model" className="input" />
        </div>
        <div>
          <label className="label">Serial number</label>
          <input name="serialNumber" className="input" />
        </div>
        <div>
          <label className="label">Condition</label>
          <select name="condition" defaultValue="GOOD" className="input">
            <option value="NEW">New</option>
            <option value="GOOD">Good</option>
            <option value="FAIR">Fair</option>
            <option value="POOR">Poor</option>
            <option value="DAMAGED">Damaged</option>
          </select>
        </div>
        <div>
          <label className="label">Purchase date</label>
          <input name="purchaseDate" type="date" className="input" />
        </div>
        <div>
          <label className="label">Cost (PHP)</label>
          <input name="cost" type="number" step="0.01" min="0" className="input" />
        </div>
        <div>
          <label className="label">Supplier</label>
          <input name="supplier" className="input" />
        </div>
        <div>
          <label className="label">Warranty expires</label>
          <input name="warrantyExpiresAt" type="date" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Location</label>
          <input name="location" className="input" />
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Creating…' : 'Create asset'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
