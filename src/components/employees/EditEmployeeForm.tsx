'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface EditableEmployee {
  id: string;
  department: string;
  position: string;
  employmentStatus: string;
  salary?: number | null;
  sssNumber?: string | null;
  philhealthNumber?: string | null;
  pagibigNumber?: string | null;
  tinNumber?: string | null;
}

export function EditEmployeeForm({
  employee,
  canEditConfidential,
  onDone,
}: {
  employee: EditableEmployee;
  canEditConfidential: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch(`/api/employees/${employee.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not update employee.');
      return;
    }

    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5 p-6">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Department</label>
          <input name="department" defaultValue={employee.department} required className="input" />
        </div>
        <div>
          <label className="label">Position</label>
          <input name="position" defaultValue={employee.position} required className="input" />
        </div>
        <div>
          <label className="label">Employment status</label>
          <select name="employmentStatus" defaultValue={employee.employmentStatus} className="input">
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On Leave</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </div>
      </div>

      {canEditConfidential && (
        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Confidential HR details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Monthly salary (PHP)</label>
              <input
                name="salary"
                type="number"
                step="0.01"
                min="0"
                defaultValue={employee.salary ?? ''}
                className="input"
              />
            </div>
            <div>
              <label className="label">SSS number</label>
              <input name="sssNumber" defaultValue={employee.sssNumber ?? ''} className="input" />
            </div>
            <div>
              <label className="label">PhilHealth number</label>
              <input name="philhealthNumber" defaultValue={employee.philhealthNumber ?? ''} className="input" />
            </div>
            <div>
              <label className="label">Pag-IBIG number</label>
              <input name="pagibigNumber" defaultValue={employee.pagibigNumber ?? ''} className="input" />
            </div>
            <div>
              <label className="label">TIN</label>
              <input name="tinNumber" defaultValue={employee.tinNumber ?? ''} className="input" />
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onDone} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
