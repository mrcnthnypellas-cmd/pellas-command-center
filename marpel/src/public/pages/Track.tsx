import { CalendarClock, Camera, CheckCircle2, Circle, FileText, KeyRound, Loader2, LogOut, MessageCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useMeta } from '../../components/brand';
import { Badge, Button, Field, Input, Modal, SimBadge, StatusBadge } from '../../components/ui';
import { projectProgress, setQuotationStatus } from '../../lib/actions';
import { useStore, useToast } from '../../lib/store';
import { cx, fmtDate, fmtDateTime, money, quoteTotals } from '../../lib/utils';
import { openChat } from '../ChatWidget';
import { PageHero, Section } from '../sections';

const PORTAL_KEY = 'marpel.portal';

export default function Track() {
  const { db, update } = useStore();
  const { push } = useToast();
  useMeta('track');
  const [projectId, setProjectId] = useState<string | null>(() => sessionStorage.getItem(PORTAL_KEY));
  const [ref, setRef] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);

  const project = projectId ? db.projects.find((p) => p.id === projectId) : undefined;

  const login = (e: React.FormEvent) => {
    e.preventDefault();
    if (attempts >= 5) return setErr('Too many attempts. Please wait a minute or contact us.');
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      const p = db.projects.find((x) => x.trackingRef.toUpperCase() === ref.trim().toUpperCase());
      // Same message for wrong ref or wrong PIN — don't reveal which projects exist.
      if (!p || p.accessPin !== pin.trim()) {
        setAttempts((a) => a + 1);
        if (attempts + 1 >= 5) setTimeout(() => setAttempts(0), 60_000);
        return setErr('We couldn’t verify that tracking reference and PIN.');
      }
      setErr('');
      sessionStorage.setItem(PORTAL_KEY, p.id);
      setProjectId(p.id);
      update((d) => {
        d.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), user: d.customers.find((c) => c.id === p.customerId)?.name ?? 'Customer', role: 'customer', action: 'Opened project tracking', target: p.trackingRef });
      });
    }, 500);
  };

  if (!project)
    return (
      <>
        <PageHero eyebrow="Client portal" title="Track your project." body="Enter the tracking reference and access PIN from your project confirmation email." />
        <Section>
          <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[1.2fr_1fr]">
            <form onSubmit={login} className="space-y-5 rounded-3xl border border-white/[0.07] bg-navy-900/60 p-8">
              <KeyRound className="h-8 w-8 text-gold-300" />
              <Field label="Tracking reference" required>
                <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="MTN-XXXX-XXXX" className="font-mono uppercase tracking-wider" autoComplete="off" />
              </Field>
              <Field label="Access PIN" required>
                <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit PIN" autoComplete="off" />
              </Field>
              {err && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</p>}
              <Button type="submit" variant="gold" size="lg" className="w-full" disabled={busy || !ref || pin.length < 6}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'View my project'}
              </Button>
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4 text-gold-400" /> You can only view projects linked to your reference and PIN.
              </p>
            </form>
            <div className="space-y-4 rounded-3xl border border-violet-400/25 bg-violet-500/[0.05] p-6">
              <SimBadge>Prototype demo access</SimBadge>
              <p className="text-sm text-slate-300">Use one of these sample projects to explore the client portal:</p>
              {[
                ['MTN-8K4P-2Q7D', '482913', 'Inventory & Sales System'],
                ['MTN-W3BP-7LCX', '135790', 'Learning Center Website'],
              ].map(([r, p, n]) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRef(r!);
                    setPin(p!);
                  }}
                  className="block w-full rounded-xl border border-white/10 bg-navy-900/60 p-3 text-left hover:border-gold-400/40"
                >
                  <p className="text-sm font-medium text-white">{n}</p>
                  <p className="font-mono text-xs text-slate-400">
                    {r} · PIN {p}
                  </p>
                </button>
              ))}
              <p className="text-xs text-slate-500">Production: customers sign in with a magic link or password, and access is enforced by database row-level security.</p>
            </div>
          </div>
        </Section>
      </>
    );

  const pct = projectProgress(project);
  const customer = db.customers.find((c) => c.id === project.customerId);
  const updates = project.updates.filter((u) => u.visibleToCustomer);
  const photos = updates.flatMap((u) => u.images);
  const quote = project.quotationId ? db.quotations.find((q) => q.id === project.quotationId) : undefined;
  const pendingQuotes = db.quotations.filter((q) => q.customerId === project.customerId && (q.status === 'Sent' || q.status === 'Viewed'));
  const pm = db.users.find((u) => u.id === project.managerId);
  const current = project.milestones.find((m) => m.status === 'active');

  return (
    <>
      <div className="border-b border-white/[0.05] bg-navy-900/40">
        <div className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gold-300">Client portal · {customer?.company || customer?.name}</p>
              <h1 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">{project.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                <span className="font-mono text-gold-200">{project.trackingRef}</span>·<span>{project.category}</span>·<StatusBadge status={project.status} />
              </div>
            </div>
            <Button
              variant="ghost"
              icon={<LogOut className="h-4 w-4" />}
              onClick={() => {
                sessionStorage.removeItem(PORTAL_KEY);
                setProjectId(null);
                setPin('');
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
      <Section className="py-10 lg:py-12">
        {pendingQuotes.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-400/30 bg-gold-400/[0.06] p-4">
            <p className="flex items-center gap-2 text-sm text-gold-100">
              <FileText className="h-4 w-4" /> You have {pendingQuotes.length} quotation{pendingQuotes.length > 1 ? 's' : ''} awaiting your review.
            </p>
            <Button size="sm" variant="gold" onClick={() => setQuoteOpen(true)}>
              Review quotation
            </Button>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-6">
              <div className="relative h-32 w-32">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  <circle cx="60" cy="60" r="52" stroke="rgba(255,255,255,0.07)" strokeWidth="10" fill="none" />
                  <circle cx="60" cy="60" r="52" stroke="url(#pg)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 326.7} 326.7`} className="transition-all duration-1000" />
                  <defs>
                    <linearGradient id="pg">
                      <stop offset="0" stopColor="#a97d2c" />
                      <stop offset="1" stopColor="#f5e9c8" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-3xl font-semibold text-white">{pct}%</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">complete</span>
                </div>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">Current stage</p>
                  <p className="mt-1 font-medium text-white">{project.status === 'Completed' ? 'Completed' : current?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">Target completion</p>
                  <p className="mt-1 font-medium text-white">{fmtDate(project.targetDate)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">Started</p>
                  <p className="mt-1 text-slate-300">{fmtDate(project.startDate)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">Project manager</p>
                  <p className="mt-1 text-slate-300">{pm?.name}</p>
                </div>
              </div>
            </div>
            <h2 className="mb-4 mt-8 font-display text-lg font-semibold text-white">Milestones</h2>
            <ol className="relative space-y-1">
              {project.milestones.map((m, i) => (
                <li key={m.id} className="relative flex gap-4 pb-4">
                  {i < project.milestones.length - 1 && <span className={cx('absolute left-[13px] top-7 h-full w-px', m.status === 'done' ? 'bg-gold-400/60' : 'bg-white/10')} />}
                  <span className={cx('relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', m.status === 'done' ? 'bg-gold-400 text-navy-950' : m.status === 'active' ? 'bg-gold-400/20 text-gold-200 ring-2 ring-gold-400/60' : 'bg-navy-800 text-slate-600 ring-1 ring-white/10')}>
                    {m.status === 'done' ? <CheckCircle2 className="h-4 w-4" /> : m.status === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin [animation-duration:2.5s]" /> : <Circle className="h-3 w-3" />}
                  </span>
                  <div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className={cx('font-medium', m.status === 'pending' ? 'text-slate-500' : 'text-white')}>{m.name}</p>
                      {m.status === 'active' && <p className="text-xs text-gold-300">In progress</p>}
                    </div>
                    <p className="text-xs text-slate-500">{m.status === 'done' ? `Completed ${fmtDate(m.completedAt)}` : m.dueDate ? `Target ${fmtDate(m.dueDate)}` : ''}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6">
              <h2 className="font-display font-semibold text-white">Project details</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{project.description}</p>
              {quote && (
                <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-sm">
                  <p className="text-xs text-slate-500">Approved quotation</p>
                  <p className="text-slate-200">
                    {quote.number} · {money(quoteTotals(quote).total, db.settings.currencySymbol)}
                  </p>
                </div>
              )}
              <Button variant="outline" className="mt-5 w-full" icon={<MessageCircle className="h-4 w-4" />} onClick={() => openChat('live')}>
                Message the project team
              </Button>
            </div>
            <div className="rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6">
              <h2 className="flex items-center gap-2 font-display font-semibold text-white">
                <Camera className="h-4 w-4 text-gold-300" /> Progress photos
              </h2>
              {photos.length ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (
                    <button key={i} type="button" onClick={() => setPhoto(p)} className="aspect-square overflow-hidden rounded-lg border border-white/10">
                      <img src={p} alt={`Progress ${i + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Photos uploaded by our team will appear here.</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
            <CalendarClock className="h-5 w-5 text-gold-300" /> Recent updates
          </h2>
          {updates.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No updates yet.</p>
          ) : (
            <ul className="mt-5 space-y-4">
              {updates.map((u) => (
                <li key={u.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-white">{u.title}</p>
                    <p className="text-xs text-slate-500">
                      {fmtDateTime(u.at)} · {u.by}
                    </p>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-400">{u.body}</p>
                  {u.images.length > 0 && (
                    <div className="mt-3 flex gap-2">
                      {u.images.map((im, i) => (
                        <button key={i} type="button" onClick={() => setPhoto(im)}>
                          <img src={im} alt="" className="h-20 w-28 rounded-lg object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
      <Modal open={!!photo} onClose={() => setPhoto(null)} title="Progress photo" size="lg">
        {photo && <img src={photo} alt="" className="mx-auto max-h-[70vh] rounded-lg" />}
      </Modal>
      <Modal open={quoteOpen} onClose={() => setQuoteOpen(false)} title="Quotations awaiting review" size="lg">
        <div className="space-y-4">
          {pendingQuotes.map((q) => {
            const t = quoteTotals(q);
            return (
              <div key={q.id} className="rounded-2xl border border-white/10 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-white">{q.title}</p>
                    <p className="text-xs text-slate-500">
                      {q.number} · valid until {fmtDate(q.expiresAt)}
                    </p>
                  </div>
                  <Badge tone="gold">{money(t.total, db.settings.currencySymbol)}</Badge>
                </div>
                <ul className="mt-3 divide-y divide-white/5 text-sm">
                  {q.items.map((it) => (
                    <li key={it.id} className="flex justify-between gap-4 py-1.5 text-slate-300">
                      <span>
                        {it.description} <span className="text-slate-500">× {it.qty}</span>
                      </span>
                      <span className="tabular-nums">{money(it.qty * it.unitPrice, db.settings.currencySymbol)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="gold"
                    size="sm"
                    onClick={() => {
                      update((d) => setQuotationStatus(d, q.id, 'Approved', { name: customer?.name ?? 'Customer', role: 'customer' }));
                      push({ tone: 'success', title: 'Quotation approved', body: 'Our team has been notified.' });
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      update((d) => setQuotationStatus(d, q.id, 'Rejected', { name: customer?.name ?? 'Customer', role: 'customer' }));
                      push({ tone: 'info', title: 'Quotation declined' });
                    }}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            );
          })}
          {pendingQuotes.length === 0 && <p className="text-sm text-slate-400">Nothing to review.</p>}
        </div>
      </Modal>
    </>
  );
}
