'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

// Deleting a user cascades to their Employee/Client record and everything scoped to
// it (Attendance, Payroll, Payslips, Transactions, Notifications) — irreversible,
// unlike the Deactivate toggle. Typing the exact username is the safeguard against
// an accidental click on something this destructive.
export function DeleteUserButton({ userId, username }: { userId: string; username: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not delete this account.');
      return;
    }
    router.push('/dashboard/users');
    router.refresh();
  }

  if (!open) {
    return (
      <div className="card space-y-2 p-6">
        <h2 className="text-sm font-semibold text-red-700">Danger Zone</h2>
        <p className="text-xs text-slate-500">
          Permanently delete this account and all of its attendance, payroll, and payslip history. This
          cannot be undone — for a temporary block, use Deactivate instead.
        </p>
        <button type="button" onClick={() => setOpen(true)} className="btn-danger">
          <Trash2 className="h-4 w-4" />
          Delete Account
        </button>
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-6">
      <h2 className="text-sm font-semibold text-red-700">Confirm permanent deletion</h2>
      <p className="text-xs text-slate-500">
        Type <span className="font-mono font-semibold text-slate-700">{username}</span> to confirm. This
        immediately and permanently deletes the account and its history.
      </p>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={username}
        className="input"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={confirmText !== username || loading}
          onClick={handleDelete}
          className="btn-danger disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Deleting…' : 'Permanently Delete'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setConfirmText(''); setError(null); }} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}
