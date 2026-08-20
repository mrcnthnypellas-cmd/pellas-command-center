'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';

export interface WorkerRow {
  id: string;
  name: string;
  position: 'SUPERVISOR' | 'ENCODER' | 'COUNTER';
  tin: string | null;
  ratePerDay: string;
  hourlyRate: string;
  hoursWorked: string;
  regularHrs: string;
  otHrs: string;
  nightDiffHrs: string;
  dailyRatePayout: string;
  otPayout: string;
  nightDiffPayout: string;
  transpoAllowance: string;
  deductionLess: string;
  netPay: string;
  receivedBy: string | null;
}

const POSITIONS: WorkerRow['position'][] = ['SUPERVISOR', 'ENCODER', 'COUNTER'];
const POSITION_LABEL: Record<WorkerRow['position'], string> = {
  SUPERVISOR: 'Counter Supervisor',
  ENCODER: 'Encoder',
  COUNTER: 'Counter',
};

function num(v: string) {
  return v.trim() === '' ? null : v.trim();
}

/** Net Pay is the one auto-computed field — a plain sum of the visible payout
 * columns minus the LESS deduction. Every other money/hour field stays manually
 * entered (no guessed OT/night-diff formula), same as the regular Payroll module. */
function computeNetPay(w: WorkerRow): string {
  const parts = [w.dailyRatePayout, w.otPayout, w.nightDiffPayout, w.transpoAllowance];
  const sum = parts.reduce((acc, p) => acc + (parseFloat(p) || 0), 0);
  const less = parseFloat(w.deductionLess) || 0;
  const net = sum - less;
  return (sum === 0 && less === 0) ? '' : net.toFixed(2);
}

export function CountRosterEditor({
  countEventId,
  initialWorkers,
}: {
  countEventId: string;
  initialWorkers: WorkerRow[];
}) {
  const router = useRouter();
  const [workers, setWorkers] = useState<WorkerRow[]>(initialWorkers);
  const [error, setError] = useState<string | null>(null);
  const [addingLoading, setAddingLoading] = useState(false);

  function updateLocal(id: string, field: keyof WorkerRow, value: string) {
    setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, [field]: value } : w)));
  }

  async function saveRow(worker: WorkerRow) {
    setError(null);
    const netPay = computeNetPay(worker);
    if (netPay !== worker.netPay) updateLocal(worker.id, 'netPay', netPay);

    const res = await fetch(`/api/count-events/${countEventId}/workers/${worker.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: worker.name,
        position: worker.position,
        tin: worker.tin || null,
        ratePerDay: num(worker.ratePerDay),
        hourlyRate: num(worker.hourlyRate),
        hoursWorked: num(worker.hoursWorked),
        regularHrs: num(worker.regularHrs),
        otHrs: num(worker.otHrs),
        nightDiffHrs: num(worker.nightDiffHrs),
        dailyRatePayout: num(worker.dailyRatePayout),
        otPayout: num(worker.otPayout),
        nightDiffPayout: num(worker.nightDiffPayout),
        transpoAllowance: num(worker.transpoAllowance),
        deductionLess: num(worker.deductionLess),
        netPay: num(netPay),
        receivedBy: worker.receivedBy || null,
      }),
    });
    if (!res.ok) {
      setError('Could not save a change — please retry.');
      return;
    }
    router.refresh();
  }

  async function addWorker() {
    setAddingLoading(true);
    setError(null);
    const res = await fetch(`/api/count-events/${countEventId}/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Worker', position: 'COUNTER' }),
    });
    setAddingLoading(false);
    if (!res.ok) {
      setError('Could not add worker.');
      return;
    }
    const data = await res.json();
    setWorkers((prev) => [
      ...prev,
      {
        id: data.worker.id,
        name: data.worker.name,
        position: data.worker.position,
        tin: null,
        ratePerDay: '',
        hourlyRate: '',
        hoursWorked: '',
        regularHrs: '',
        otHrs: '',
        nightDiffHrs: '',
        dailyRatePayout: '',
        otPayout: '',
        nightDiffPayout: '',
        transpoAllowance: '',
        deductionLess: '',
        netPay: '',
        receivedBy: null,
      },
    ]);
  }

  async function removeWorker(id: string) {
    if (!confirm('Remove this person from the count sheet?')) return;
    setError(null);
    const res = await fetch(`/api/count-events/${countEventId}/workers/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Could not remove worker.');
      return;
    }
    setWorkers((prev) => prev.filter((w) => w.id !== id));
    router.refresh();
  }

  const cellInput = (
    worker: WorkerRow,
    field: keyof WorkerRow,
    opts?: { width?: string; type?: string },
  ) => (
    <input
      type={opts?.type ?? 'text'}
      value={(worker[field] as string) ?? ''}
      onChange={(e) => updateLocal(worker.id, field, e.target.value)}
      onBlur={() => void saveRow(workers.find((w) => w.id === worker.id)!)}
      className={`rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-900 ${opts?.width ?? 'w-20'}`}
    />
  );

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Roster — Attendance &amp; Payroll (shared)</h2>
        <button type="button" onClick={addWorker} disabled={addingLoading} className="btn-primary py-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Add Person
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Editing a name or position here updates both the printable Attendance Sheet and Payroll
        Sheet — they read from this same list.
      </p>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1400px] text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left font-medium uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Position</th>
              <th className="px-2 py-2">TIN</th>
              <th className="px-2 py-2">Rate/Day</th>
              <th className="px-2 py-2">Hourly Rate</th>
              <th className="px-2 py-2">Hrs Worked</th>
              <th className="px-2 py-2">Regular Hrs</th>
              <th className="px-2 py-2">OT Hrs</th>
              <th className="px-2 py-2">Night Diff Hrs</th>
              <th className="px-2 py-2">Daily Rate Payout</th>
              <th className="px-2 py-2">OT Payout</th>
              <th className="px-2 py-2">Night Diff Payout</th>
              <th className="px-2 py-2">Transpo/Meal Allow.</th>
              <th className="px-2 py-2">LESS</th>
              <th className="px-2 py-2">Net Pay</th>
              <th className="px-2 py-2">Received By</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {workers.length === 0 ? (
              <tr>
                <td colSpan={17} className="px-4 py-8 text-center text-slate-500">
                  No one on this count sheet yet — click &quot;Add Person&quot;.
                </td>
              </tr>
            ) : (
              workers.map((w) => (
                <tr key={w.id}>
                  <td className="px-2 py-1.5">{cellInput(w, 'name', { width: 'w-36' })}</td>
                  <td className="px-2 py-1.5">
                    <select
                      value={w.position}
                      onChange={(e) => updateLocal(w.id, 'position', e.target.value)}
                      onBlur={() => void saveRow(workers.find((x) => x.id === w.id)!)}
                      className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-900"
                    >
                      {POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {POSITION_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">{cellInput(w, 'tin', { width: 'w-24' })}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'ratePerDay')}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'hourlyRate')}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'hoursWorked')}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'regularHrs')}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'otHrs')}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'nightDiffHrs')}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'dailyRatePayout')}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'otPayout')}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'nightDiffPayout')}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'transpoAllowance')}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'deductionLess')}</td>
                  <td className="px-2 py-1.5 font-medium text-slate-900">{w.netPay || '—'}</td>
                  <td className="px-2 py-1.5">{cellInput(w, 'receivedBy', { width: 'w-24' })}</td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => removeWorker(w.id)}
                      aria-label={`Remove ${w.name}`}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
