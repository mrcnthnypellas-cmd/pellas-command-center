'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function PayrollActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setStatus(next: string) {
    setLoading(true);
    const res = await fetch(`/api/payroll/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  if (status === 'DRAFT') {
    return (
      <button type="button" disabled={loading} onClick={() => setStatus('PROCESSED')} className="btn-secondary">
        Mark Processed
      </button>
    );
  }
  if (status === 'PROCESSED') {
    return (
      <button type="button" disabled={loading} onClick={() => setStatus('PAID')} className="btn-primary">
        Mark Paid &amp; Issue Payslip
      </button>
    );
  }
  return <span className="badge bg-emerald-50 text-emerald-700">Paid</span>;
}
