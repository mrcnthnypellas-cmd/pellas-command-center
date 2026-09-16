'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Login failed.');
        return;
      }
      router.push('/admin');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm border border-ivory/10 bg-navy-900 p-8">
        <h1 className="font-serif text-2xl text-ivory">Dashboard Login</h1>
        <p className="mt-2 text-sm text-navy-300">
          Sign in to edit site content and view consultation requests.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-navy-300">
              Username
            </label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-ivory/15 bg-navy-950 px-4 py-3 text-sm text-ivory outline-none focus:border-gold-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-navy-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-ivory/15 bg-navy-950 px-4 py-3 text-sm text-ivory outline-none focus:border-gold-500"
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full bg-gold-500 px-4 py-3 text-sm font-medium text-navy-950 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>

        <p className="mt-6 text-center text-xs text-navy-400">
          No account yet? Run <code className="text-navy-300">npm run create-admin</code> in the project terminal.
        </p>
      </form>
    </div>
  );
}
