'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { User, Lock, Eye, EyeOff } from 'lucide-react';

const REMEMBERED_USERNAME_KEY = 'pellas_remembered_username';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMessage, setForgotMessage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasBackground, setHasBackground] = useState(true);
  const [hasLogo, setHasLogo] = useState(true);
  const [appName, setAppName] = useState('My Pellas Command Center');
  const [zoomPercent, setZoomPercent] = useState(100);

  useEffect(() => {
    const remembered = typeof window !== 'undefined' ? localStorage.getItem(REMEMBERED_USERNAME_KEY) : null;
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
    fetch('/api/platform-settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.appName) setAppName(data.appName);
        setHasLogo(!!data.hasLogo);
        if (data.zoomPercent) setZoomPercent(data.zoomPercent);
      })
      .catch(() => {});
  }, []);

  async function getLocation(): Promise<{ lat: string; lng: string } | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      );
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Best-effort: not every role requires a geofence check, so a denied/unavailable
    // location prompt shouldn't block roles that don't need it — the server decides.
    const location = await getLocation();

    const result = await signIn('credentials', {
      email,
      password,
      lat: location?.lat,
      lng: location?.lng,
      redirect: false,
    });

    setLoading(false);

    if (!result || result.error) {
      // Custom messages (location gate) are shown verbatim; the default "CredentialsSignin"
      // code stays generic so we never confirm/deny whether the username exists (spec §6).
      setError(
        result?.error && result.error !== 'CredentialsSignin'
          ? result.error
          : 'Invalid username or password.',
      );
      return;
    }

    if (typeof window !== 'undefined') {
      if (rememberMe) localStorage.setItem(REMEMBERED_USERNAME_KEY, email);
      else localStorage.removeItem(REMEMBERED_USERNAME_KEY);
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-800 px-4"
      style={{ zoom: zoomPercent / 100 } as React.CSSProperties}
    >
      {hasBackground && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/api/platform-settings/background"
          alt=""
          onError={() => setHasBackground(false)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-navy-900/50" />

      <div className="relative w-full max-w-sm rounded-2xl border border-white/20 bg-white/85 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 text-center">
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/api/platform-settings/logo"
              alt={appName}
              onError={() => setHasLogo(false)}
              className="mx-auto mb-3 h-12 w-12 rounded-xl object-contain shadow-lg"
            />
          ) : (
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-lg">
              {appName.trim()[0]?.toUpperCase() ?? 'P'}
            </div>
          )}
          <h1 className="text-xl font-bold text-navy-900">Welcome Back!</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in to {appName}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
              type="text"
              required
              autoComplete="username"
              placeholder="Username"
              className="w-full rounded-lg border border-slate-200 bg-white/90 py-2.5 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Password"
              className="w-full rounded-lg border border-slate-200 bg-white/90 py-2.5 pl-9 pr-9 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-1.5 text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
              />
              Remember me
            </label>
            <button
              type="button"
              onClick={() => setForgotMessage(true)}
              className="font-medium text-brand-600 hover:underline"
            >
              Forgot Password?
            </button>
          </div>

          {forgotMessage && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Please contact your Company Admin or Super Admin to reset your password.
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/70">
        © {new Date().getFullYear()} Pellas Command Center. All rights reserved.
        <br />
        This system made by Marc Pellas
      </p>
    </div>
  );
}
