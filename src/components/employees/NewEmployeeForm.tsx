'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function NewEmployeeForm({ canSetConfidential }: { canSetConfidential: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not create employee.');
      return;
    }

    const data = await res.json();
    setCreatedPassword(data.tempPassword);
  }

  if (createdPassword) {
    return (
      <div className="card space-y-4 p-6">
        <h2 className="text-base font-semibold text-emerald-700">Employee created</h2>
        <p className="text-sm text-slate-600">
          Temporary password (share this with the employee securely — it will not be shown again):
        </p>
        <div className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm">{createdPassword}</div>
        <button type="button" className="btn-primary" onClick={() => router.push('/dashboard/employees')}>
          Back to employee list
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5 p-6">
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
          <label className="label">Employee code</label>
          <input name="employeeCode" required className="input" />
        </div>
        <div>
          <label className="label">Department</label>
          <input name="department" required className="input" />
        </div>
        <div>
          <label className="label">Position</label>
          <input name="position" required className="input" />
        </div>
        <div>
          <label className="label">Hire date</label>
          <input name="hireDate" type="date" required className="input" />
        </div>
      </div>

      {canSetConfidential && (
        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Confidential HR details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Monthly salary (PHP)</label>
              <input name="salary" type="number" step="0.01" min="0" className="input" />
            </div>
            <div>
              <label className="label">SSS number</label>
              <input name="sssNumber" className="input" />
            </div>
            <div>
              <label className="label">PhilHealth number</label>
              <input name="philhealthNumber" className="input" />
            </div>
            <div>
              <label className="label">Pag-IBIG number</label>
              <input name="pagibigNumber" className="input" />
            </div>
            <div>
              <label className="label">TIN</label>
              <input name="tinNumber" className="input" />
            </div>
          </div>
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? 'Creating…' : 'Create employee'}
      </button>
    </form>
  );
}
