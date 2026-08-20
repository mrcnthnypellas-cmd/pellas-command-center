'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function UserStatusToggle({ userId, status }: { userId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = status === 'ACTIVE';

  async function toggle() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: active ? 'INACTIVE' : 'ACTIVE' }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not update status.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        disabled={loading}
        onClick={toggle}
        className={active ? 'btn-secondary py-1.5 text-xs' : 'btn-primary py-1.5 text-xs'}
      >
        {loading ? '…' : active ? 'Deactivate' : 'Reactivate'}
      </button>
    </div>
  );
}
