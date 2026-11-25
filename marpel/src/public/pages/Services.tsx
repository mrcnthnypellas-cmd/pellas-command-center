import { ArrowLeft, Check, CheckCircle2, Sparkles } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Artwork, useMeta } from '../../components/brand';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui';
import { useDB } from '../../lib/store';
import { cx, money } from '../../lib/utils';
import { CTABand, PageHero, Section, SectionHeading, ServiceActions, ServiceCard } from '../sections';
import NotFound from './NotFound';

export function ServicesIndex() {
  const db = useDB();
  useMeta('services');
  const services = db.services.filter((s) => s.status === 'published').sort((a, b) => a.order - b.order);
  return (
    <>
      <PageHero eyebrow="Services" title="Five service lines. One accountable team." body="From your website to your network rack — choose a service to see what’s included, packages and starting prices." />
      <Section>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <ServiceCard key={s.id} s={s} symbol={db.settings.currencySymbol} />
          ))}
        </div>
      </Section>
      <Section className="pt-0">
        <SectionHeading eyebrow="Service catalogue" title="Everything we can help with" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {services.map((s) => (
            <div key={s.id} className="rounded-2xl border border-white/[0.07] bg-navy-900/50 p-5">
              <Link to={`/services/${s.slug}`} className="flex items-center gap-2 font-display text-sm font-semibold text-white hover:text-gold-200">
                <Icon name={s.icon} className="h-4 w-4 text-gold-300" /> {s.name}
              </Link>
              <ul className="mt-3 space-y-1.5">
                {s.offerings.map((o) => (
                  <li key={o} className="flex gap-2 text-xs text-slate-400">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-gold-400" /> {o}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
      <CTABand />
    </>
  );
}

export function ServiceDetail() {
  const { slug } = useParams();
  const db = useDB();
  const nav = useNavigate();
  const s = db.services.find((x) => x.slug === slug && x.status === 'published');
  useMeta('services', s ? { title: s.seoTitle, description: s.seoDescription } : undefined);
  if (!s) return <NotFound />;
  const others = db.services.filter((x) => x.status === 'published' && x.id !== s.id).sort((a, b) => a.order - b.order);
  const sym = db.settings.currencySymbol;
  const related = db.portfolio.filter((p) => p.status === 'published' && (p.category.split(' ')[0] === s.name.split(' ')[0] || (s.slug.includes('mikrotik') && p.category.includes('MikroTik')) || (s.slug.includes('infrastructure') && p.category === 'Network Infrastructure'))).slice(0, 2);

  return (
    <>
      <div className="relative overflow-hidden border-b border-white/[0.05]">
        <div className="absolute inset-0 bg-grid-faint [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 lg:grid-cols-2 lg:px-8 lg:py-20">
          <div className="animate-fade-up">
            <Link to="/services" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-gold-200">
              <ArrowLeft className="h-4 w-4" /> All services
            </Link>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-400/30 bg-gold-400/10 text-gold-200">
                <Icon name={s.icon} className="h-6 w-6" />
              </span>
              {s.showPrice && s.startingPrice ? (
                <span className="rounded-full border border-gold-400/25 bg-gold-400/5 px-3 py-1 text-xs text-gold-200">Starts at {money(s.startingPrice, sym, 0)}</span>
              ) : null}
            </div>
            <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">{s.name}</h1>
            <p className="mt-4 text-lg text-gold-100/90">{s.short}</p>
            <p className="mt-4 leading-relaxed text-slate-400">{s.description}</p>
            <ServiceActions slug={s.slug} className="mt-8" />
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            <div className="aspect-[4/3]">
              <Artwork topic={s.name} image={s.image} label={s.name} iconSize="h-16 w-16" />
            </div>
          </div>
        </div>
      </div>

      {s.gallery.length > 0 && (
        <Section className="pb-0">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {s.gallery.map((g, i) => (
              <img key={i} src={g} alt={`${s.name} ${i + 1}`} className="aspect-[4/3] w-full rounded-2xl border border-white/10 object-cover" loading="lazy" />
            ))}
          </div>
        </Section>
      )}

      <Section>
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.07] bg-navy-900/50 p-7">
            <h2 className="font-display text-lg font-semibold text-white">Services included</h2>
            <ul className="mt-4 space-y-2.5">
              {s.offerings.map((o) => (
                <li key={o} className="flex gap-2.5 text-sm text-slate-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> {o}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-navy-900/50 p-7">
            <h2 className="font-display text-lg font-semibold text-white">Features</h2>
            <ul className="mt-4 space-y-2.5">
              {s.features.map((o) => (
                <li key={o} className="flex gap-2.5 text-sm text-slate-300">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> {o}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gold-400/25 bg-gradient-to-br from-gold-400/10 to-transparent p-7">
            <h2 className="font-display text-lg font-semibold text-white">Benefits for your business</h2>
            <ul className="mt-4 space-y-2.5">
              {s.benefits.map((o) => (
                <li key={o} className="flex gap-2.5 text-sm text-slate-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> {o}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {s.packages.length > 0 && (
        <Section className="pt-0">
          <SectionHeading eyebrow="Packages" title="Available packages" body="Starting prices are indicative. Your final price is confirmed in a written, itemised quotation after assessment." />
          <div className="grid gap-6 md:grid-cols-3">
            {s.packages.map((p) => (
              <div key={p.id} className={cx('relative flex flex-col rounded-2xl border p-7', p.popular ? 'border-gold-400/50 bg-gradient-to-b from-gold-400/10 to-navy-900/60 shadow-gold' : 'border-white/[0.07] bg-navy-900/50')}>
                {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold-sheen px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-navy-950">Most requested</span>}
                <h3 className="font-display text-lg font-semibold text-white">{p.name}</h3>
                <p className="mt-3">
                  {s.showPrice && p.price !== null ? (
                    <>
                      <span className="font-display text-3xl font-semibold text-gold-200">{money(p.price, sym, 0)}</span>
                      <span className="ml-1.5 text-sm text-slate-500">{p.priceNote}</span>
                    </>
                  ) : (
                    <span className="font-display text-xl font-semibold text-gold-200">{p.price === null ? 'Custom pricing' : 'Request a quote'}</span>
                  )}
                </p>
                {p.price === null && <p className="text-xs text-slate-500">{p.priceNote}</p>}
                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-sm text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> {f}
                    </li>
                  ))}
                </ul>
                <Button variant={p.popular ? 'gold' : 'outline'} className="mt-7 w-full" onClick={() => nav(`/quote?service=${s.slug}&package=${encodeURIComponent(p.name)}`)}>
                  Request quotation
                </Button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {related.length > 0 && (
        <Section className="pt-0">
          <SectionHeading align="left" eyebrow="Related work" title={`${s.name} projects`} />
          <div className="grid gap-6 md:grid-cols-2">
            {related.map((p) => (
              <Link key={p.id} to={`/portfolio?p=${p.id}`} className="group flex gap-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-navy-900/50 p-4 hover:border-gold-400/40">
                <div className="h-28 w-40 shrink-0 overflow-hidden rounded-xl">
                  <Artwork topic={p.category} image={p.image} label={p.title} iconSize="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-white group-hover:text-gold-100">{p.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">{p.summary}</p>
                  <p className="mt-2 text-xs text-slate-500">{p.client}</p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section className="pt-0">
        <SectionHeading align="left" eyebrow="Explore" title="Other services" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {others.map((o) => (
            <Link key={o.id} to={`/services/${o.slug}`} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-navy-900/50 p-4 transition hover:border-gold-400/40">
              <Icon name={o.icon} className="h-5 w-5 text-gold-300" />
              <span className="text-sm font-medium text-white">{o.name}</span>
            </Link>
          ))}
        </div>
      </Section>
      <CTABand />
    </>
  );
}
