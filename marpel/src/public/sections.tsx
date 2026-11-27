import { ArrowRight, CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, Copy, FileText, MessageCircle, Quote as QuoteIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Artwork } from '../components/brand';
import { Icon } from '../components/icons';
import { AttachmentPicker, Button, Field, Input, Select, Stars, Textarea } from '../components/ui';
import { submitInquiry } from '../lib/actions';
import { useStore, useToast } from '../lib/store';
import type { Attachment, Service } from '../lib/types';
import { clean, cx, isEmail, isPhone, money } from '../lib/utils';
import { openChat } from './ChatWidget';

export function Section({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx('relative mx-auto px-5 lg:px-8', /\bmax-w-/.test(className ?? '') ? '' : 'max-w-7xl', /\bpy-/.test(className ?? '') ? '' : 'py-20 lg:py-24', className)}>
      {children}
    </section>
  );
}

export function SectionHeading({ eyebrow, title, body, align = 'center', action }: { eyebrow?: string; title: ReactNode; body?: ReactNode; align?: 'center' | 'left'; action?: ReactNode }) {
  return (
    <div className={cx('mb-12 flex flex-col gap-4', align === 'center' ? 'items-center text-center' : 'items-start sm:flex-row sm:items-end sm:justify-between')}>
      <div className={cx(align === 'center' && 'max-w-2xl')}>
        {eyebrow && (
          <p className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300">
            <span className="h-px w-6 bg-gold-400/60" />
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">{title}</h2>
        {body && <p className="mt-4 text-base leading-relaxed text-slate-400">{body}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHero({ eyebrow, title, body, children, background }: { eyebrow: string; title: ReactNode; body?: ReactNode; children?: ReactNode; background?: { image?: string; dim: number } }) {
  return (
    <div className="relative overflow-hidden border-b border-white/[0.05]">
      {background?.image && (
        <>
          <img src={background.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-navy-950" style={{ opacity: Math.min(90, Math.max(0, background.dim)) / 100 }} />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-navy-950 to-transparent" />
        </>
      )}
      <div className="absolute inset-0 bg-grid-faint [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="absolute -top-40 left-1/2 h-80 w-[700px] -translate-x-1/2 rounded-full bg-gold-400/10 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-14 lg:px-8 lg:pb-20 lg:pt-20">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold-400/25 bg-gold-400/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-200">{eyebrow}</p>
        <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">{title}</h1>
        {body && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">{body}</p>}
        {children}
      </div>
    </div>
  );
}

export function ServiceCard({ s, symbol }: { s: Service; symbol: string }) {
  return (
    <Link to={`/services/${s.slug}`} className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-navy-900/60 transition duration-300 hover:-translate-y-1 hover:border-gold-400/40 hover:shadow-gold">
      <div className="aspect-[16/9] overflow-hidden">
        <Artwork topic={s.name} image={s.image} label={s.name} className="transition duration-500 group-hover:scale-105" />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold-400/25 bg-gold-400/10 text-gold-200">
            <Icon name={s.icon} className="h-5 w-5" />
          </span>
          <h3 className="font-display text-lg font-semibold text-white">{s.name}</h3>
        </div>
        <p className="text-sm leading-relaxed text-slate-400">{s.short}</p>
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {s.offerings.slice(0, 4).map((o) => (
            <li key={o} className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-slate-300">
              {o}
            </li>
          ))}
          {s.offerings.length > 4 && <li className="px-1 py-0.5 text-[11px] text-slate-500">+{s.offerings.length - 4} more</li>}
        </ul>
        <div className="mt-auto flex items-center justify-between pt-6">
          {s.showPrice && s.startingPrice ? (
            <span className="text-xs text-slate-500">
              Starts at <span className="font-display text-base font-semibold text-gold-200">{money(s.startingPrice, symbol, 0)}</span>
            </span>
          ) : (
            <span className="text-xs text-slate-500">Price upon inquiry</span>
          )}
          <span className="flex items-center gap-1 text-sm font-medium text-gold-200 transition group-hover:gap-2">
            Learn more <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ServiceActions({ slug, className }: { slug?: string; className?: string }) {
  const nav = useNavigate();
  return (
    <div className={cx('flex flex-wrap gap-3', className)}>
      <Button variant="gold" size="lg" icon={<FileText className="h-4 w-4" />} onClick={() => nav(`/quote${slug ? `?service=${slug}` : ''}`)}>
        Request Quotation
      </Button>
      <Button variant="outline" size="lg" icon={<CalendarCheck className="h-4 w-4" />} onClick={() => nav(`/book${slug ? `?service=${slug}` : ''}`)}>
        Book Consultation
      </Button>
      <Button variant="ghost" size="lg" icon={<MessageCircle className="h-4 w-4" />} onClick={() => openChat()}>
        Send Inquiry
      </Button>
    </div>
  );
}

export function Testimonials() {
  const { db } = useStore();
  const items = db.testimonials.filter((t) => t.status === 'published');
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [items.length]);
  if (!items.length) return null;
  const visible = [items[i % items.length]!, items[(i + 1) % items.length]!, items[(i + 2) % items.length]!].slice(0, Math.min(3, items.length));
  return (
    <div>
      <div className="grid gap-5 md:grid-cols-3">
        {visible.map((t, k) => (
          <figure key={t.id + k} className={cx('relative flex animate-fade-up flex-col rounded-2xl border border-white/[0.07] bg-navy-900/60 p-6', k > 0 && 'hidden md:flex')}>
            <QuoteIcon className="h-8 w-8 text-gold-400/40" />
            <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-slate-300">“{t.quote}”</blockquote>
            <figcaption className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
              <div>
                <p className="text-sm font-semibold text-white">{t.name}</p>
                <p className="text-xs text-slate-500">
                  {t.role}, {t.company}
                </p>
              </div>
              <Stars value={t.rating} />
            </figcaption>
          </figure>
        ))}
      </div>
      {items.length > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button type="button" onClick={() => setI((x) => (x - 1 + items.length) % items.length)} className="rounded-full border border-white/10 p-2 text-slate-400 hover:border-gold-400/50 hover:text-gold-200" aria-label="Previous testimonial">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-1.5">
            {items.map((t, k) => (
              <button key={t.id} type="button" onClick={() => setI(k)} className={cx('h-1.5 rounded-full transition-all', k === i % items.length ? 'w-6 bg-gold-300' : 'w-1.5 bg-white/20')} aria-label={`Show testimonial ${k + 1}`} />
            ))}
          </div>
          <button type="button" onClick={() => setI((x) => (x + 1) % items.length)} className="rounded-full border border-white/10 p-2 text-slate-400 hover:border-gold-400/50 hover:text-gold-200" aria-label="Next testimonial">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      <p className="mt-6 text-center text-[11px] text-slate-600">Sample testimonials for prototype review — replace with real client feedback in Admin → Website Content.</p>
    </div>
  );
}

export function CTABand() {
  const { db } = useStore();
  const nav = useNavigate();
  return (
    <div className="mx-auto max-w-7xl px-5 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-gold-400/25 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-8 py-14 text-center sm:px-14">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gold-400/15 blur-3xl" />
        <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative">
          <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">{db.content.ctaBand.title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">{db.content.ctaBand.body}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="gold" size="lg" onClick={() => nav('/quote')}>
              Request a Quotation
            </Button>
            <Button variant="outline" size="lg" onClick={() => nav('/book')}>
              Book a Consultation
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const BUDGET_OPTIONS = ['Below ₱25,000', '₱25,000 – ₱50,000', '₱50,000 – ₱100,000', '₱100,000 – ₱250,000', '₱250,000+', 'Not sure yet'];
export const SCHEDULE_OPTIONS = ['As soon as possible', 'Within 2 weeks', 'Within the month', 'In 1–3 months', 'Flexible / planning stage'];

/** The full customer inquiry / quotation request form. */
export function InquiryForm({ defaultService, compact, onDone }: { defaultService?: string; compact?: boolean; onDone?: (ref: string) => void }) {
  const { db, update } = useStore();
  const { push } = useToast();
  const services = db.services.filter((s) => s.status === 'published').sort((a, b) => a.order - b.order);
  const [f, setF] = useState({
    name: '',
    email: '',
    mobile: '',
    company: '',
    service: defaultService ?? '',
    title: '',
    description: '',
    budget: '',
    schedule: '',
    consent: false,
  });
  const [files, setFiles] = useState<Attachment[]>([]);
  const [err, setErr] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (defaultService) setF((x) => ({ ...x, service: defaultService }));
  }, [defaultService]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const x: Record<string, string> = {};
    if (clean(f.name).length < 2) x.name = 'Please enter your full name';
    if (!isEmail(f.email)) x.email = 'Please enter a valid email address';
    if (!isPhone(f.mobile)) x.mobile = 'Please enter a valid mobile number';
    if (!f.service) x.service = 'Please choose a service';
    if (!compact && clean(f.title).length < 3) x.title = 'Give your project a short title';
    if (clean(f.description).length < 15) x.description = 'Please describe your project (at least 15 characters)';
    if (!f.consent) x.consent = 'Please agree so we can contact you about this inquiry';
    setErr(x);
    if (Object.keys(x).length) {
      push({ tone: 'warning', title: 'Please check the highlighted fields' });
      return;
    }
    setBusy(true);
    setTimeout(() => {
      let ref = '';
      update((d) => {
        ref = submitInquiry(d, {
          name: clean(f.name, 120),
          email: f.email.trim().toLowerCase(),
          mobile: f.mobile.trim(),
          company: clean(f.company, 160),
          service: f.service,
          title: clean(f.title, 160) || `${f.service} inquiry`,
          description: clean(f.description, 5000),
          budget: f.budget || 'Not sure yet',
          schedule: f.schedule || 'Flexible / planning stage',
          attachments: files,
          source: 'Website Form',
        }).ref;
      });
      setBusy(false);
      setDone(ref);
      onDone?.(ref);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 600);
  };

  if (done)
    return (
      <div className="animate-fade-up rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.04] p-8 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-300" />
        <h3 className="mt-4 font-display text-2xl font-semibold text-white">Thank you — we received your inquiry!</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Our team will review your requirements and contact you within one business day. A confirmation email is sent to {f.email}.</p>
        <div className="mx-auto mt-6 inline-flex items-center gap-3 rounded-xl border border-gold-400/30 bg-navy-950/60 px-5 py-3">
          <span className="text-xs uppercase tracking-wider text-slate-500">Reference no.</span>
          <span className="font-display text-xl font-semibold tracking-wider text-gold-200">{done}</span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(done);
              push({ tone: 'info', title: 'Reference copied' });
            }}
            className="text-slate-400 hover:text-white"
            aria-label="Copy reference number"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/book">
            <Button variant="gold">Book a consultation</Button>
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              setDone(null);
              setF({ ...f, title: '', description: '' });
              setFiles([]);
            }}
          >
            Submit another inquiry
          </Button>
        </div>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={err.name}>
          <Input value={f.name} onChange={set('name')} autoComplete="name" maxLength={120} />
        </Field>
        <Field label="Company name" hint="Optional">
          <Input value={f.company} onChange={set('company')} autoComplete="organization" maxLength={160} />
        </Field>
        <Field label="Email address" required error={err.email}>
          <Input type="email" value={f.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field label="Mobile number" required error={err.mobile}>
          <Input type="tel" value={f.mobile} onChange={set('mobile')} autoComplete="tel" placeholder="+63 9xx xxx xxxx" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Requested service" required error={err.service}>
          <Select value={f.service} onChange={set('service')}>
            <option value="">Select a service…</option>
            {services.map((s) => (
              <option key={s.id}>{s.name}</option>
            ))}
            <option>Not sure — please advise</option>
          </Select>
        </Field>
        {!compact && (
          <Field label="Project title" required error={err.title}>
            <Input value={f.title} onChange={set('title')} placeholder="e.g. 8 CCTV cameras for warehouse" maxLength={160} />
          </Field>
        )}
      </div>
      <Field label="Project description" required error={err.description} hint="What do you need, where is the site, and any details (number of cameras, pages, users, etc.)">
        <Textarea rows={compact ? 4 : 6} value={f.description} onChange={set('description')} maxLength={5000} />
      </Field>
      {!compact && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Estimated budget">
              <Select value={f.budget} onChange={set('budget')}>
                <option value="">Select a range…</option>
                {BUDGET_OPTIONS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </Select>
            </Field>
            <Field label="Preferred schedule">
              <Select value={f.schedule} onChange={set('schedule')}>
                <option value="">Select…</option>
                {SCHEDULE_OPTIONS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Attachments & reference images" hint="Floor plans, photos of the site, sample designs, existing system screenshots">
            <AttachmentPicker value={files} onChange={setFiles} />
          </Field>
        </>
      )}
      <label className="flex items-start gap-3 text-sm text-slate-400">
        <input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-1 h-4 w-4 accent-[#d8ae5a]" />
        <span>
          I agree that {db.settings.shortName} may contact me about this inquiry and process my information under the Data Privacy Act of 2012.
          {err.consent && <span className="mt-1 block text-xs text-red-300">{err.consent}</span>}
        </span>
      </label>
      <Button type="submit" variant="gold" size="lg" disabled={busy} className="w-full sm:w-auto">
        {busy ? 'Submitting…' : compact ? 'Send inquiry' : 'Submit quotation request'}
        {!busy && <ArrowRight className="h-4 w-4" />}
      </Button>
    </form>
  );
}

/** Splits the motto at its dash: the first half sets up, the second half (the promise) is highlighted. */
export function splitMotto(m: string): [string, string] {
  const parts = m.split(/\s*[—–]\s*|\s+-\s+/);
  return parts.length > 1 ? [parts[0]!, parts.slice(1).join(' ')] : [m, ''];
}

/** Animated company promise band: words rise in one by one when scrolled into view; the promise shimmers in gold. */
export function MottoBand() {
  const { db } = useStore();
  const motto = db.content.motto?.trim();
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) return setSeen(true);
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && (setSeen(true), io.disconnect()), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (!motto) return null;
  const [lead, promise] = splitMotto(motto);
  const leadWords = lead.split(/\s+/).filter(Boolean);
  const promiseWords = promise.split(/\s+/).filter(Boolean);
  const step = 0.11;
  const word = (w: string, i: number, gold: boolean) => (
    <span key={`${gold}-${i}`} className={cx('inline-block', seen ? 'animate-word-in motion-reduce:animate-none' : 'opacity-0 motion-reduce:opacity-100')} style={{ animationDelay: `${i * step}s` }}>
      <span className={gold ? 'text-gold-gradient animate-shimmer [background-size:200%_auto]' : undefined}>{w}</span>
      {'\u00a0'}
    </span>
  );
  const dashAt = leadWords.length;
  return (
    <section ref={ref} aria-label="Our promise" className="relative overflow-hidden border-y border-white/[0.05] bg-navy-950 py-20 sm:py-24">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[680px] max-w-[95vw] animate-float-glow rounded-full bg-gold-400/[0.10] blur-[90px] motion-reduce:animate-none" />
      <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative mx-auto max-w-5xl px-5 text-center">
        <p className={cx('mb-6 text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-300', seen ? 'animate-fade-up' : 'opacity-0 motion-reduce:opacity-100')}>Our promise</p>
        <blockquote className="font-display text-[clamp(1.9rem,4.4vw,3.4rem)] font-semibold leading-[1.15] tracking-tight text-white [text-wrap:balance]">
          <span className="sr-only">{motto}</span>
          <span aria-hidden>
            {leadWords.map((w, i) => word(w, i, false))}
            {promiseWords.length > 0 && (
              <span className={cx('inline-block text-gold-300', seen ? 'animate-word-in motion-reduce:animate-none' : 'opacity-0 motion-reduce:opacity-100')} style={{ animationDelay: `${dashAt * step}s` }}>
                —{'\u00a0'}
              </span>
            )}
            {promiseWords.map((w, i) => word(w, dashAt + 1 + i, true))}
          </span>
        </blockquote>
        <div className="mx-auto mt-8 h-px w-40 overflow-hidden bg-white/10">
          <div className={cx('h-full w-full origin-center bg-gradient-to-r from-transparent via-gold-300 to-transparent', seen ? 'animate-draw-line motion-reduce:animate-none' : 'scale-x-0 motion-reduce:scale-x-100')} style={{ animationDelay: `${(dashAt + promiseWords.length) * step + 0.2}s` }} />
        </div>
        <p className={cx('mt-5 text-sm tracking-wide text-slate-400', seen ? 'animate-fade-up' : 'opacity-0 motion-reduce:opacity-100')} style={{ animationDelay: `${(dashAt + promiseWords.length) * step + 0.4}s` }}>
          {db.settings.businessName}
        </p>
      </div>
    </section>
  );
}
