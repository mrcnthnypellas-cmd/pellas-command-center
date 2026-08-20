'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

interface CompanyOption {
  id: string;
  name: string;
}

export function NewCountEventForm({
  companies,
  isSuperAdmin,
}: {
  companies: CompanyOption[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch('/api/count-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not create count sheet.');
      return;
    }
    const data = await res.json();
    router.push(`/dashboard/mondelez-attendance/${data.event.id}`);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <Plus className="h-4 w-4" />
        New Count Sheet
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-6">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Site name</label>
          <input name="siteName" required placeholder="e.g. MAERSK NDC" className="input" />
        </div>
        <div>
          <label className="label">Inventory count date</label>
          <input name="eventDate" type="date" required className="input" />
        </div>
        <div>
          <label className="label">Time schedule — start</label>
          <input name="timeScheduleStart" defaultValue="06:00AM" className="input" />
        </div>
        <div>
          <label className="label">Time schedule — end</label>
          <input name="timeScheduleEnd" defaultValue="2:00PM" className="input" />
        </div>
        <div>
          <label className="label">Agency name (printed letterhead)</label>
          <input name="agencyName" defaultValue="Anthony L. Pellas & Associates" className="input" />
        </div>
        <div>
          <label className="label">Client name</label>
          <input name="clientName" defaultValue="Mondelez Philippines, Inc." className="input" />
        </div>
        {isSuperAdmin && (
          <div>
            <label className="label">Company</label>
            <select name="companyId" required className="input">
              <option value="">Select company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Creating…' : 'Create'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
