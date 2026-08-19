'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'];

export function TransactionStatusControl({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleChange(next: string) {
    if (next === status) return;
    setLoading(true);
    const res = await fetch(`/api/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <select
      className="input w-auto py-1 text-xs"
      value={status}
      disabled={loading}
      onChange={(e) => handleChange(e.target.value)}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
