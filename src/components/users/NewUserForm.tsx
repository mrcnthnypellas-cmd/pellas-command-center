'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface CompanyOption {
  id: string;
  name: string;
}

const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'COMPANY_ADMIN', label: 'Company Admin' },
  { value: 'HR_ADMIN', label: 'HR Admin' },
  { value: 'IT_ADMIN', label: 'IT Admin' },
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'CLIENT', label: 'Client' },
];

export function NewUserForm({ companies }: { companies: CompanyOption[] }) {
  const router = useRouter();
  const [role, setRole] = useState('EMPLOYEE');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message =
        typeof data.error === 'string'
          ? data.error
          : data.error?.formErrors?.[0] ?? data.error?.fieldErrors
            ? Object.values(data.error.fieldErrors ?? {})
                .flat()
                .join(', ') || 'Could not create user.'
            : 'Could not create user.';
      setError(message);
      return;
    }

    setCreated(String(payload.username));
  }

  if (created) {
    return (
      <div className="card space-y-3 p-6">
        <h2 className="text-base font-semibold text-emerald-700">User created</h2>
        <p className="text-sm text-slate-600">
          <span className="font-mono">{created}</span> can now sign in with the password you set.
        </p>
        <button type="button" className="btn-primary" onClick={() => router.push('/dashboard/users')}>
          Back to Users
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
          <label className="label">Username</label>
          <input name="username" required placeholder="e.g. jsantos" className="input" />
        </div>
        <div>
          <label className="label">Password</label>
          <input name="password" type="password" required minLength={5} className="input" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input name="phone" className="input" />
        </div>
        <div>
          <label className="label">Role</label>
          <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className="input">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {role !== 'SUPER_ADMIN' && (
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

      {role === 'EMPLOYEE' && (
        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Employee details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          </div>
        </div>
      )}

      {role === 'CLIENT' && (
        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Client details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Client code</label>
              <input name="clientCode" required className="input" />
            </div>
            <div>
              <label className="label">Business name</label>
              <input name="businessName" className="input" />
            </div>
          </div>
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? 'Creating…' : 'Create user'}
      </button>
    </form>
  );
}
