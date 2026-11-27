import { ArrowRight, BadgeCheck, CalendarCheck, Camera, CheckCircle2, ClipboardList, Clock, Cpu, Globe, Hammer, LifeBuoy, Mail, MapPin, Phone, Router, Search, ShieldCheck, Wifi } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Artwork, useMeta } from '../../components/brand';
import { Icon } from '../../components/icons';
import { Badge, Button } from '../../components/ui';
import { useDB } from '../../lib/store';
import { fmtDate, fmtTime } from '../../lib/utils';
import { CTABand, InquiryForm, MottoBand, Section, SectionHeading, ServiceCard, Testimonials } from '../sections';

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] animate-fade-up [animation-delay:150ms]">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-gold-400/20 via-transparent to-sky-500/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-navy-900/80 p-5 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Site overview</span>
        </div>
        {/* topology */}
        <svg viewBox="0 0 440 190" className="w-full" aria-hidden>
          <defs>
            <linearGradient id="hv-l" x1="0" x2="1">
              <stop offset="0" stopColor="#d8ae5a" stopOpacity=".1" />
              <stop offset=".5" stopColor="#e3c27a" stopOpacity=".9" />
              <stop offset="1" stopColor="#d8ae5a" stopOpacity=".1" />
            </linearGradient>
          </defs>
          {[
            [220, 40, 80, 120],
            [220, 40, 220, 130],
            [220, 40, 360, 120],
            [80, 120, 40, 170],
            [80, 120, 130, 170],
            [360, 120, 320, 170],
            [360, 120, 405, 170],
            [220, 130, 220, 175],
          ].map(([a, b, c, d], i) => (
            <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="url(#hv-l)" strokeWidth="1.5" strokeDasharray="4 5">
              <animate attributeName="stroke-dashoffset" from="18" to="0" dur={`${1.4 + (i % 3) * 0.3}s`} repeatCount="indefinite" />
            </line>
          ))}
          {[
            [220, 40, 16],
            [80, 120, 12],
            [220, 130, 12],
            [360, 120, 12],
            [40, 170, 7],
            [130, 170, 7],
            [320, 170, 7],
            [405, 170, 7],
            [220, 175, 7],
          ].map(([x, y, r], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={r! + 6} fill="#d8ae5a" fillOpacity=".08" />
              <circle cx={x} cy={y} r={r} fill="#0b1528" stroke="#d8ae5a" strokeOpacity=".7" />
            </g>
          ))}
        </svg>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { icon: Router, label: 'Dual-ISP', value: 'Failover ready' },
            { icon: Camera, label: 'CCTV', value: '16 / 16 online' },
            { icon: Wifi, label: 'Wi-Fi', value: '12 APs' },
          ].map((x) => (
            <div key={x.label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
              <x.icon className="h-4 w-4 text-gold-300" />
              <p className="mt-1.5 text-[10px] uppercase tracking-wider text-slate-500">{x.label}</p>
              <p className="text-xs font-semibold text-white">{x.value}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -left-6 top-1/3 hidden rounded-2xl border border-white/10 bg-navy-850/95 p-3 shadow-2xl backdrop-blur sm:block">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Milestone</p>
            <p className="text-xs font-semibold text-white">Website deployed</p>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 right-4 hidden rounded-2xl border border-gold-400/30 bg-navy-850/95 p-3 shadow-gold backdrop-blur sm:block">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">Project progress</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-gold-500 to-gold-200" />
          </div>
          <span className="text-xs font-semibold text-gold-200">72%</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const db = useDB();
  const nav = useNavigate();
  useMeta('home');
  const c = db.content;
  const s = db.settings;
  const services = db.services.filter((x) => x.status === 'published').sort((a, b) => a.order - b.order);
  const featured = db.portfolio.filter((p) => p.status === 'published' && p.featured).slice(0, 3);

  return (
    <>
      {/* HERO */}
      <div className="relative -mt-[72px] overflow-hidden pt-[72px]">
        <div className="absolute inset-0 bg-grid-faint [background-size:52px_52px] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_0%,black,transparent)]" />
        <div className="absolute -top-32 right-[-10%] h-[520px] w-[520px] rounded-full bg-gold-400/[0.13] blur-[120px]" />
        <div className="absolute left-[-10%] top-40 h-[420px] w-[420px] rounded-full bg-sky-600/10 blur-[120px]" />
        {c.hero.image && <img src={c.hero.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />}
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-12 lg:grid-cols-[1.1fr_1fr] lg:px-8 lg:pb-32 lg:pt-20">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-gold-400/25 bg-gold-400/5 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-200">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-gold-300" />
              {c.hero.eyebrow}
            </p>
            <h1 className="mt-6 font-display text-[2.6rem] font-semibold leading-[1.06] tracking-tight text-white sm:text-6xl">
              {c.hero.title} <span className="text-gold-gradient animate-shimmer">{c.hero.highlight}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">{c.hero.subtitle}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button variant="gold" size="lg" onClick={() => nav('/services')}>
                Explore Our Services <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => nav('/quote')}>
                Request a Quotation
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link to="/book" className="inline-flex items-center gap-1.5 text-slate-300 hover:text-gold-200">
                <CalendarCheck className="h-4 w-4 text-gold-300" /> Book a Consultation
              </Link>
              <Link to="/contact" className="inline-flex items-center gap-1.5 text-slate-300 hover:text-gold-200">
                <Phone className="h-4 w-4 text-gold-300" /> Contact Us
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500">
              {['Itemised quotations', 'Free site inspection*', 'Online project tracking'].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <BadgeCheck className="h-4 w-4 text-gold-400" /> {t}
                </span>
              ))}
            </div>
          </div>
          <HeroVisual />
        </div>
        {/* stats (hidden until real figures are entered in Website Content) */}
        {c.stats.length > 0 && (
        <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/[0.07] bg-navy-900/60 backdrop-blur lg:grid-cols-4">
            {c.stats.map((st, i) => (
              <div key={st.id} className={`p-6 text-center ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b lg:border-b-0' : ''} border-white/[0.06] lg:border-r lg:last:border-r-0`}>
                <p className="font-display text-3xl font-semibold text-gold-gradient">{st.value}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">{st.label}</p>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>

      {/* PROMISE */}
      <div className="mt-16">
        <MottoBand />
      </div>

      {/* INTRO + SERVICES */}
      <Section>
        <SectionHeading eyebrow="What we do" title={c.intro.title} body={c.intro.body} />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {services.map((x) => (
            <ServiceCard key={x.id} s={x} symbol={s.currencySymbol} />
          ))}
          <div className="flex flex-col justify-between rounded-2xl border border-dashed border-gold-400/30 bg-gold-400/[0.03] p-6">
            <div>
              <Search className="h-8 w-8 text-gold-300" />
              <h3 className="mt-4 font-display text-lg font-semibold text-white">Not sure what you need?</h3>
              <p className="mt-2 text-sm text-slate-400">Describe your problem and we will recommend the right solution — or ask our assistant in the chat.</p>
            </div>
            <Button variant="outline" className="mt-6 self-start" onClick={() => nav('/book?service=it-consultation')}>
              Book an IT consultation
            </Button>
          </div>
        </div>
      </Section>

      {/* WHY CHOOSE */}
      <div className="relative border-y border-white/[0.05] bg-navy-900/40">
        <Section>
          <SectionHeading eyebrow="Why choose Marpel" title="Engineering discipline. Business-minded delivery." />
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
            {c.whyChoose.map((w) => (
              <div key={w.id} className="group bg-navy-950/90 p-7 transition hover:bg-navy-900">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold-400/25 bg-gold-400/10 text-gold-200 transition group-hover:scale-110">
                  <Icon name={w.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-display text-base font-semibold text-white">{w.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{w.desc}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* EXPERTISE + PROCESS */}
      <Section>
        <div className="grid gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading align="left" eyebrow="Our expertise" title="Depth across software and the field." body="Our team combines developers and certified field technicians, so applications, cameras and networks are designed to work together." />
            <ul className="space-y-3">
              {c.expertise.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-navy-900/50 px-4 py-3 text-sm text-slate-200">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-gold-300" />
                  {e.label}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionHeading align="left" eyebrow="How we work" title="A clear, four-step process." />
            <ol className="relative space-y-4 before:absolute before:bottom-6 before:left-[23px] before:top-6 before:w-px before:bg-gradient-to-b before:from-gold-400/60 before:to-transparent">
              {[
                { icon: ClipboardList, t: 'Assess', d: 'Consultation or free site inspection to understand your operations and constraints.' },
                { icon: Cpu, t: 'Propose', d: 'Itemised quotation with scope, timeline, equipment and payment terms in writing.' },
                { icon: Hammer, t: 'Build & install', d: 'Development and installation with milestone updates you can track online.' },
                { icon: LifeBuoy, t: 'Turn over & support', d: 'Testing, training, documentation and after-sales support.' },
              ].map((x, i) => (
                <li key={x.t} className="relative flex gap-4 rounded-2xl border border-white/[0.06] bg-navy-900/50 p-4">
                  <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-gold-200 ring-1 ring-gold-400/30">
                    <x.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-400">Step {i + 1}</p>
                    <p className="font-display font-semibold text-white">{x.t}</p>
                    <p className="mt-1 text-sm text-slate-400">{x.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      {/* FEATURED PROJECTS */}
      {featured.length > 0 && (
        <Section className="pt-0">
          <SectionHeading
            align="left"
            eyebrow="Featured projects"
            title="Recent work we’re proud of."
            action={
              <Link to="/portfolio" className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-200 hover:gap-2.5">
                View portfolio <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <div className="grid gap-6 lg:grid-cols-3">
            {featured.map((p) => (
              <Link key={p.id} to={`/portfolio?p=${p.id}`} className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-navy-900/60 transition hover:border-gold-400/40">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Artwork topic={p.category} image={p.image ?? p.afterImage} label={p.title} className="object-left-top transition duration-500 group-hover:scale-105" />
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-navy-950 to-transparent" />
                  <Badge tone="gold" className="absolute left-4 top-4 bg-navy-950/70 backdrop-blur">
                    {p.category}
                  </Badge>
                </div>
                <div className="p-6">
                  <h3 className="font-display text-lg font-semibold text-white group-hover:text-gold-100">{p.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-400">{p.summary}</p>
                  <p className="mt-4 text-xs text-slate-500">
                    {p.client}
                    {p.completedAt && ` · ${fmtDate(p.completedAt, { month: 'short', year: 'numeric' })}`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* TESTIMONIALS (shown once real client feedback is published in Website Content) */}
      {db.testimonials.some((t) => t.status === 'published') && (
        <div className="border-y border-white/[0.05] bg-navy-900/40">
          <Section>
            <SectionHeading eyebrow="Client feedback" title="Trusted by businesses, schools and clinics." />
            <Testimonials />
          </Section>
        </div>
      )}

      <div className="pt-20">
        <CTABand />
      </div>

      {/* CONTACT */}
      <Section id="contact">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionHeading align="left" eyebrow="Contact us" title="Let’s talk about your project." body="Send a quick message and we’ll get back to you, or reach us directly." />
            <ul className="space-y-4 text-sm">
              {[
                { icon: Phone, label: 'Phone', value: `${s.phone} · ${s.mobile}`, href: `tel:${s.mobile.replace(/\s/g, '')}` },
                { icon: Mail, label: 'Email', value: s.email, href: `mailto:${s.email}` },
                { icon: MapPin, label: 'Office', value: `${s.address}, ${s.city}` },
                { icon: Clock, label: 'Hours', value: s.hours.filter((h) => !h.closed).length ? `Mon–Fri ${fmtTime(s.hours[0]!.open)}–${fmtTime(s.hours[0]!.close)}` : 'By appointment' },
              ].map((x) => (
                <li key={x.label} className="flex gap-4 rounded-2xl border border-white/[0.06] bg-navy-900/50 p-4">
                  <x.icon className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">{x.label}</p>
                    {x.href ? (
                      <a href={x.href} className="text-slate-200 hover:text-gold-200">
                        {x.value}
                      </a>
                    ) : (
                      <p className="text-slate-200">{x.value}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-gold-400" />
              <Globe className="h-4 w-4 text-gold-400" />
              Serving Metro Manila and nearby provinces
            </div>
          </div>
          <div className="rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6 sm:p-8">
            <h3 className="mb-6 font-display text-xl font-semibold text-white">Quick inquiry</h3>
            <InquiryForm compact />
          </div>
        </div>
      </Section>
    </>
  );
}
