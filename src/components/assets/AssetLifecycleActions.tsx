'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
}

type LifecycleAction = 'ASSIGN' | 'TRANSFER' | 'RETURN' | 'REPAIR' | 'AUDIT' | 'RETIRE';

export function AssetLifecycleActions({
  assetId,
  isAssigned,
  employees,
}: {
  assetId: string;
  isAssigned: boolean;
  employees: EmployeeOption[];
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);
  const [toEmployeeId, setToEmployeeId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableActions: LifecycleAction[] = isAssigned
    ? ['TRANSFER', 'RETURN', 'REPAIR', 'AUDIT', 'RETIRE']
    : ['ASSIGN', 'REPAIR', 'AUDIT', 'RETIRE'];

  async function submit(action: LifecycleAction) {
    if ((action === 'ASSIGN' || action === 'TRANSFER') && !toEmployeeId) {
      setError('Select an employee first.');
      return;
    }
    if ((action === 'REPAIR' || action === 'RETIRE') && !notes.trim()) {
      setError('Notes are required for this action.');
      return;
    }

    setLoading(true);
    setError(null);

    const body: Record<string, unknown> = { action, notes: notes || undefined };
    if (action === 'ASSIGN' || action === 'TRANSFER') body.toEmployeeId = toEmployeeId;

    const res = await fetch(`/api/assets/${assetId}/lifecycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Action failed.');
      return;
    }

    setPendingAction(null);
    setToEmployeeId('');
    setNotes('');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {availableActions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => setPendingAction(action === pendingAction ? null : action)}
            className={pendingAction === action ? 'btn-primary' : 'btn-secondary'}
          >
            {actionLabel(action)}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {pendingAction && (
        <div className="card space-y-3 p-4">
          {(pendingAction === 'ASSIGN' || pendingAction === 'TRANSFER') && (
            <div>
              <label className="label">Employee</label>
              <select
                className="input"
                value={toEmployeeId}
                onChange={(e) => setToEmployeeId(e.target.value)}
              >
                <option value="">Select employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">Notes {(pendingAction === 'REPAIR' || pendingAction === 'RETIRE') && '(required)'}</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <button type="button" disabled={loading} onClick={() => submit(pendingAction)} className="btn-primary">
            {loading ? 'Saving…' : `Confirm ${actionLabel(pendingAction)}`}
          </button>
        </div>
      )}
    </div>
  );
}

function actionLabel(action: LifecycleAction): string {
  return action.charAt(0) + action.slice(1).toLowerCase();
}
