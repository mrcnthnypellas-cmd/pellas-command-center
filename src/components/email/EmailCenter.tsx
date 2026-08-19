'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface SentEmail {
  id: string;
  toAddress: string;
  subject: string;
  status: string;
  createdAt: string;
}

export function EmailCenter() {
  const [tab, setTab] = useState<'compose' | 'sent'>('compose');
  const [logs, setLogs] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function loadSent() {
    const res = await fetch('/api/email/sent');
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs);
    }
  }

  useEffect(() => {
    if (tab === 'sent') void loadSent();
  }, [tab]);

  async function handleSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not send email.');
      return;
    }

    setSuccess(true);
    (e.target as HTMLFormElement).reset();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-200">
        {(['compose', 'sent'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize ${
              tab === t ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'compose' ? (
        <form onSubmit={handleSend} className="card space-y-4 p-6">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {success && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Email sent.</div>
          )}
          <div>
            <label className="label">To</label>
            <input name="to" type="email" required className="input" />
          </div>
          <div>
            <label className="label">Subject</label>
            <input name="subject" required className="input" />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea name="body" rows={8} required className="input" />
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            <Send className="h-4 w-4" />
            {loading ? 'Sending…' : 'Send'}
          </button>
        </form>
      ) : (
        <div className="card divide-y divide-slate-100">
          {logs.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No emails sent yet.</p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-slate-900">{l.subject}</div>
                  <div className="text-xs text-slate-500">To: {l.toAddress}</div>
                </div>
                <div className="text-right">
                  <span
                    className={
                      l.status === 'sent' ? 'badge bg-emerald-50 text-emerald-700' : 'badge bg-red-50 text-red-700'
                    }
                  >
                    {l.status}
                  </span>
                  <div className="mt-1 text-xs text-slate-400">{formatDateTime(l.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
