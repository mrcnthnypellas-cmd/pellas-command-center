import { ArrowLeft, Eye, EyeOff, FlaskConical, Lock, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/brand';
import { Button, Field, Input } from '../components/ui';
import { ROLE_LABEL } from '../lib/permissions';
import { useSession, useStore } from '../lib/store';

export default function Login() {
  const { login, user } = useSession();
  const { db } = useStore();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    document.title = 'Sign in · Marpel Admin';
    if (user) nav(loc.state?.from ?? '/admin', { replace: true });
  }, [user, nav, loc.state]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = login(u, p);
    if (r) setErr(r);
  };
  const demos = db.users.filter((x) => x.active).slice(0, 4);
  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-white/[0.06] bg-navy-900 lg:block">
        <div className="absolute inset-0 bg-grid-faint [background-size:44px_44px]" />
        <div className="absolute -left-20 top-20 h-96 w-96 rounded-full bg-gold-400/15 blur-[100px]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />
          <div>
            <h1 className="font-display text-4xl font-semibold leading-tight text-white">
              Your business,
              <br />
              <span className="text-gold-gradient">one command center.</span>
            </h1>
            <p className="mt-4 max-w-md text-slate-400">Inquiries, conversations, quotations, projects and appointments — managed from a single secure dashboard.</p>
          </div>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-gold-400" /> Role-based access · Session timeout · Audit logging
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-10 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-gold-200">
            <ArrowLeft className="h-4 w-4" /> Back to website
          </Link>
          <div className="lg:hidden">
            <Logo />
          </div>
          <h2 className="mt-6 font-display text-2xl font-semibold text-white">Sign in to the dashboard</h2>
          <p className="mt-1 text-sm text-slate-400">Authorized staff only.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Username or email">
              <Input value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoFocus />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input type={show ? 'text' : 'password'} value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" className="pr-10" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {err && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</p>}
            <Button type="submit" variant="gold" size="lg" className="w-full" icon={<Lock className="h-4 w-4" />} disabled={!u || !p}>
              Sign in
            </Button>
          </form>
          <div className="mt-8 rounded-2xl border border-violet-400/25 bg-violet-500/[0.05] p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-200">
              <FlaskConical className="h-3.5 w-3.5" /> Demo accounts (password: demo1234)
            </p>
            <div className="mt-3 grid gap-1.5">
              {demos.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setU(d.username);
                    setP(d.password);
                    setErr('');
                  }}
                  className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-navy-900/60 px-3 py-2 text-left text-xs hover:border-gold-400/40"
                >
                  <span className="text-slate-200">{d.username}</span>
                  <span className="text-slate-500">{ROLE_LABEL[d.role]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
