import { Bell, ChevronDown, CloudOff, ExternalLink, FlaskConical, KeyRound, Loader2, LogOut, Menu, Search, UserCog, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/brand';
import { Icon } from '../components/icons';
import { Avatar, Badge, Button, Field, Input, Modal } from '../components/ui';
import { can, MODULES, ROLE_LABEL, scopeConversations, scopeInquiries } from '../lib/permissions';
import { useSession, useStore, useToast } from '../lib/store';
import { LIVE, sb } from '../lib/supabase';
import { cx, timeAgo } from '../lib/utils';
import { NotificationIcon } from './shared';

function GlobalSearch() {
  const { db } = useStore();
  const { user } = useSession();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  const results = useMemo(() => {
    if (!user || q.trim().length < 2) return [];
    const t = q.toLowerCase();
    const out: { label: string; sub: string; to: string; kind: string }[] = [];
    scopeInquiries(db, user)
      .filter((i) => `${i.ref} ${i.name} ${i.title} ${i.company}`.toLowerCase().includes(t))
      .slice(0, 5)
      .forEach((i) => out.push({ kind: 'Inquiry', label: `${i.ref} · ${i.title}`, sub: i.name, to: `/admin/inquiries/${i.id}` }));
    if (can(user, 'customers'))
      db.customers
        .filter((c) => `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(t))
        .slice(0, 5)
        .forEach((c) => out.push({ kind: 'Customer', label: c.name, sub: c.company || c.email, to: `/admin/customers/${c.id}` }));
    db.projects
      .filter((p) => (user.role !== 'staff' || p.staffIds.includes(user.id) || p.managerId === user.id) && `${p.code} ${p.name} ${p.trackingRef}`.toLowerCase().includes(t))
      .slice(0, 4)
      .forEach((p) => out.push({ kind: 'Project', label: `${p.code} · ${p.name}`, sub: p.trackingRef, to: `/admin/projects/${p.id}` }));
    if (can(user, 'quotations'))
      db.quotations
        .filter((x) => `${x.number} ${x.title}`.toLowerCase().includes(t))
        .slice(0, 4)
        .forEach((x) => out.push({ kind: 'Quotation', label: `${x.number} · ${x.title}`, sub: x.status, to: `/admin/quotations/${x.id}` }));
    return out;
  }, [q, db, user]);
  return (
    <div className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search inquiries, customers, projects…"
        className="h-10 w-full rounded-xl border border-white/[0.07] bg-navy-900/70 pl-9 pr-14 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-gold-400/50"
        aria-label="Global search"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/10 px-1.5 text-[10px] text-slate-500">Ctrl K</kbd>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-white/10 bg-navy-850 shadow-2xl">
          {results.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No matches for “{q}”.</p>
          ) : (
            results.map((r) => (
              <button
                key={r.to}
                type="button"
                onMouseDown={() => {
                  nav(r.to);
                  setQ('');
                }}
                className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-2.5 text-left last:border-0 hover:bg-white/5"
              >
                <Badge tone="slate" className="w-20 justify-center">
                  {r.kind}
                </Badge>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-200">{r.label}</span>
                  <span className="block truncate text-xs text-slate-500">{r.sub}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const { db, update } = useStore();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const unread = db.notifications.filter((n) => !n.read).length;
  const latest = db.notifications.slice(0, 8);
  const prev = useRef(unread);
  const { push } = useToast();
  // Toast when a new notification arrives (e.g. from the public site in another tab)
  useEffect(() => {
    if (unread > prev.current && db.notifications[0] && !db.notifications[0].read) push({ tone: 'info', title: db.notifications[0].title, body: db.notifications[0].body });
    prev.current = unread;
  }, [unread, db.notifications, push]);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-navy-900/70 text-slate-300 hover:text-white" aria-label={`Notifications (${unread} unread)`}>
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-bold text-navy-950">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-[min(380px,calc(100vw-24px))] animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-navy-850 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <p className="font-display text-sm font-semibold text-white">Notifications</p>
              <button type="button" onClick={() => update((d) => d.notifications.forEach((n) => (n.read = true)))} className="text-xs text-gold-200 hover:underline" disabled={!unread}>
                Mark all as read
              </button>
            </div>
            <ul className="max-h-[420px] overflow-y-auto">
              {latest.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      update((d) => {
                        const x = d.notifications.find((y) => y.id === n.id);
                        if (x) x.read = true;
                      });
                      setOpen(false);
                      nav(n.link);
                    }}
                    className={cx('flex w-full gap-3 border-b border-white/5 px-4 py-3 text-left hover:bg-white/5', !n.read && 'bg-gold-400/[0.04]')}
                  >
                    <NotificationIcon type={n.type} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cx('truncate text-sm', n.read ? 'text-slate-300' : 'font-medium text-white')}>{n.title}</span>
                        {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" />}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{n.body}</span>
                      <span className="text-[10px] text-slate-600">{timeAgo(n.at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                nav('/admin/notifications');
              }}
              className="w-full py-3 text-center text-xs font-medium text-gold-200 hover:bg-white/5"
            >
              View notification history
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout, login } = useSession();
  const { db } = useStore();
  const { push } = useToast();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  if (!user) return null;
  return (
    <div className="relative">
      {pw && <ChangePassword onClose={() => setPw(false)} />}
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 hover:bg-white/5">
        <Avatar name={user.name} />
        <span className="hidden text-left lg:block">
          <span className="block text-sm font-medium leading-tight text-white">{user.name}</span>
          <span className="block text-[11px] text-gold-300">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-14 z-50 w-72 animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-navy-850 shadow-2xl">
            <div className="border-b border-white/[0.07] p-4">
              <p className="text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-slate-500">
                {user.title} · {user.email}
              </p>
            </div>
            {!LIVE && (
            <div className="border-b border-white/[0.07] p-2">
              <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                <FlaskConical className="h-3 w-3" /> Prototype: switch account
              </p>
              {db.users
                .filter((u) => u.active && u.id !== user.id)
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      logout();
                      const err = login(u.username, u.password) as string | null;
                      if (err) push({ tone: 'error', title: err });
                      else {
                        push({ tone: 'success', title: `Signed in as ${u.name}`, body: ROLE_LABEL[u.role] });
                        nav('/admin');
                      }
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                  >
                    <Avatar name={u.name} size="sm" />
                    <span>
                      <span className="block text-xs text-slate-200">{u.name}</span>
                      <span className="block text-[10px] text-slate-500">{ROLE_LABEL[u.role]}</span>
                    </span>
                  </button>
                ))}
            </div>
            )}
            <div className="p-2">
              {LIVE && (
                <button type="button" onClick={() => (setOpen(false), setPw(true))} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-white/5">
                  <KeyRound className="h-4 w-4" /> Change password
                </button>
              )}
              {can(user, 'users') && (
                <button type="button" onClick={() => (setOpen(false), nav('/admin/users'))} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-white/5">
                  <UserCog className="h-4 w-4" /> Users & roles
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  logout();
                  nav('/admin/login');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-rose-300 hover:bg-rose-500/10"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const { push } = useToast();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (a.length < 10) return setErr('Use at least 10 characters.');
    if (a !== b) return setErr('The two passwords do not match.');
    setBusy(true);
    const { error } = await sb().auth.updateUser({ password: a });
    setBusy(false);
    if (error) return setErr(error.message);
    push({ tone: 'success', title: 'Password changed' });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Change password"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="New password" hint="At least 10 characters">
          <Input type="password" value={a} onChange={(e) => setA(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" />
        </Field>
        {err && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</p>}
      </div>
    </Modal>
  );
}

function SyncStatus() {
  const { sync } = useStore();
  if (!LIVE) return null;
  if (sync.error)
    return (
      <span className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200" title={sync.error}>
        <CloudOff className="h-3.5 w-3.5" /> Not saved
      </span>
    );
  if (sync.saving)
    return (
      <span className="flex items-center gap-1.5 px-2 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    );
  return null;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { db } = useStore();
  const { user } = useSession();
  if (!user) return null;
  const counts: Partial<Record<string, number>> = {
    inquiries: scopeInquiries(db, user).filter((i) => i.status === 'New').length,
    chat: scopeConversations(db, user).reduce((n, c) => n + c.adminUnread, 0),
    notifications: db.notifications.filter((n) => !n.read).length,
    appointments: db.appointments.filter((a) => a.status === 'Pending' && (user.role !== 'staff' || a.assignedTo === user.id)).length,
  };
  const groups = [...new Set(MODULES.map((m) => m.group))];
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] items-center border-b border-white/[0.06] px-5">
        <Link to="/admin" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Admin">
        {groups.map((g) => {
          const items = MODULES.filter((m) => m.group === g && m.roles.includes(user.role) && !(LIVE && m.key === 'guide'));
          if (!items.length) return null;
          return (
            <div key={g}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{g}</p>
              <ul className="space-y-0.5">
                {items.map((m) => (
                  <li key={m.key}>
                    <NavLink
                      to={m.path}
                      end={m.path === '/admin'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cx('group relative flex items-center gap-3 rounded-xl px-3 py-[7px] text-sm transition', isActive ? 'bg-gradient-to-r from-gold-400/15 to-transparent text-gold-50' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white')
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gold-300" />}
                          <Icon name={m.icon} className={cx('h-[18px] w-[18px]', isActive ? 'text-gold-300' : 'text-slate-500 group-hover:text-slate-300')} />
                          <span className="flex-1">{m.label}</span>
                          {!!counts[m.key] && <span className={cx('rounded-full px-1.5 text-[10px] font-semibold', m.key === 'chat' || m.key === 'inquiries' ? 'bg-gold-400 text-navy-950' : 'bg-white/10 text-slate-300')}>{counts[m.key]}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      {LIVE ? (
        <div className="flex items-center gap-1.5 border-t border-white/[0.06] px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-emerald-300/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live · cloud database
        </div>
      ) : (
        <div className="flex items-center gap-1.5 border-t border-white/[0.06] px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-violet-300/80" title="Data is saved in this browser. Email, AI and storage are simulated.">
          <FlaskConical className="h-3 w-3" /> Prototype mode · local data
        </div>
      )}
    </div>
  );
}

export default function AdminLayout() {
  const { user } = useSession();
  const { storageWarning } = useStore();
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const mod = MODULES.filter((m) => loc.pathname === m.path || (m.path !== '/admin' && loc.pathname.startsWith(m.path))).pop();

  useEffect(() => {
    document.title = `${mod?.label ?? 'Admin'} · Marpel Admin`;
  }, [mod]);

  // Route protection by role (staff cannot open management modules even by URL).
  const allowed = !mod || (user && mod.roles.includes(user.role));
  return (
    <div className="min-h-screen bg-navy-950 bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(216,174,90,0.07),transparent)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/[0.06] bg-navy-950/95 lg:block">
        <Sidebar />
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-fade-in border-r border-white/10 bg-navy-950">
            <button type="button" onClick={() => setMobile(false)} className="absolute right-3 top-5 rounded-lg p-2 text-slate-400" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setMobile(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-white/[0.06] bg-navy-950/80 px-4 backdrop-blur-xl sm:px-6">
          <button type="button" onClick={() => setMobile(true)} className="rounded-lg p-2 text-slate-300 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <SyncStatus />
            <button type="button" onClick={() => nav('/')} className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white sm:flex">
              <ExternalLink className="h-4 w-4" /> View website
            </button>
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        {storageWarning && <div className="bg-amber-500/15 px-6 py-2 text-sm text-amber-200">{storageWarning}</div>}
        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {allowed ? (
            <Outlet />
          ) : (
            <div className="mx-auto max-w-md py-24 text-center">
              <p className="font-display text-xl font-semibold text-white">Access restricted</p>
              <p className="mt-2 text-sm text-slate-400">Your role ({user && ROLE_LABEL[user.role]}) does not have permission to open {mod?.label}. Ask a Super Administrator if you need access.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
