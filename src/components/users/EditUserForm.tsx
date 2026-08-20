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

interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  companyId: string | null;
  status: string;
  employee: { employeeCode: string; department: string; position: string } | null;
  client: { clientCode: string; businessName: string | null } | null;
}

export function EditUserForm({ user, companies }: { user: UserData; companies: CompanyOption[] }) {
  const router = useRouter();
  const [role, setRole] = useState(user.role);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (!payload.password) delete payload.password;

    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message =
        typeof data.error === 'string'
          ? data.error
          : Object.values(data.error?.fieldErrors ?? {})
              .flat()
              .join(', ') || 'Could not update user.';
      setError(message);
      return;
    }

    router.push('/dashboard/users');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5 p-6">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div>
        <label className="label">Username</label>
        <input value={user.email} disabled className="input opacity-60" />
        <p className="mt-1 text-xs text-slate-500">Username can&apos;t be changed after creation.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">First name</label>
          <input name="firstName" required defaultValue={user.firstName} className="input" />
        </div>
        <div>
          <label className="label">Last name</label>
          <input name="lastName" required defaultValue={user.lastName} className="input" />
        </div>
        <div>
          <label className="label">New password (leave blank to keep current)</label>
          <input name="password" type="password" minLength={5} className="input" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input name="phone" defaultValue={user.phone ?? ''} className="input" />
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
            <select name="companyId" required defaultValue={user.companyId ?? ''} className="input">
              <option value="">Select company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={user.status} className="input">
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive (blocked from logging in)</option>
          </select>
        </div>
      </div>

      {role === 'EMPLOYEE' && user.employee && (
        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Employee details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Employee code</label>
              <input value={user.employee.employeeCode} disabled className="input opacity-60" />
            </div>
            <div>
              <label className="label">Department</label>
              <input name="department" required defaultValue={user.employee.department} className="input" />
            </div>
            <div>
              <label className="label">Position</label>
              <input name="position" required defaultValue={user.employee.position} className="input" />
            </div>
          </div>
        </div>
      )}

      {role === 'CLIENT' && user.client && (
        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Client details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Client code</label>
              <input value={user.client.clientCode} disabled className="input opacity-60" />
            </div>
            <div>
              <label className="label">Business name</label>
              <input name="businessName" defaultValue={user.client.businessName ?? ''} className="input" />
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={() => router.push('/dashboard/users')} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
