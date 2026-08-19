'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

export function NewPayrollForm({ employees }: { employees: EmployeeOption[] }) {
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

    const res = await fetch('/api/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not create payroll run.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        New Payroll Run
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-6">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Employee</label>
          <select name="employeeId" required className="input">
            <option value="">Select employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName} ({e.employeeCode})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Pay period start</label>
          <input name="payPeriodStart" type="date" required className="input" />
        </div>
        <div>
          <label className="label">Pay period end</label>
          <input name="payPeriodEnd" type="date" required className="input" />
        </div>
        <div>
          <label className="label">Gross pay (PHP)</label>
          <input name="gross" type="number" step="0.01" min="0" required className="input" />
        </div>
        <div>
          <label className="label">SSS deduction</label>
          <input name="sssDeduction" type="number" step="0.01" min="0" defaultValue={0} className="input" />
        </div>
        <div>
          <label className="label">PhilHealth deduction</label>
          <input name="philhealthDeduction" type="number" step="0.01" min="0" defaultValue={0} className="input" />
        </div>
        <div>
          <label className="label">Pag-IBIG deduction</label>
          <input name="pagibigDeduction" type="number" step="0.01" min="0" defaultValue={0} className="input" />
        </div>
        <div>
          <label className="label">Withholding tax</label>
          <input name="taxDeduction" type="number" step="0.01" min="0" defaultValue={0} className="input" />
        </div>
        <div>
          <label className="label">Other deductions</label>
          <input name="otherDeductions" type="number" step="0.01" min="0" defaultValue={0} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Other deductions note</label>
          <input name="otherDeductionsNote" className="input" />
        </div>
      </div>

      <p className="text-xs text-slate-500">
        SSS/PhilHealth/Pag-IBIG/tax amounts are entered manually per pay period — this build does not
        auto-calculate statutory contributions.
      </p>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Creating…' : 'Create payroll run'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
