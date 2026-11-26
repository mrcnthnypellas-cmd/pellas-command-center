import { Calendar, ExternalLink, MapPin, Star } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Artwork, useMeta } from '../../components/brand';
import { Badge, Modal, Tabs } from '../../components/ui';
import { useDB } from '../../lib/store';
import { PORTFOLIO_CATEGORIES, type PortfolioItem } from '../../lib/types';
import { cx, fmtDate } from '../../lib/utils';
import { CTABand, PageHero, Section, ServiceActions } from '../sections';

function BeforeAfter({ before, after, topic }: { before?: string; after?: string; topic: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative aspect-video select-none overflow-hidden rounded-xl border border-white/10">
      <div className="absolute inset-0">
        <Artwork topic={topic} image={after} label="After" />
      </div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <div className="h-full w-full grayscale">
          <Artwork topic={topic} image={before} label="Before" />
        </div>
      </div>
      <div className="absolute inset-y-0 w-0.5 bg-gold-300" style={{ left: `${pos}%` }} />
      <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">Before</span>
      <span className="absolute right-3 top-3 rounded bg-gold-400/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-navy-950">After</span>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="absolute inset-x-0 bottom-3 mx-auto w-2/3 accent-[#d8ae5a]" aria-label="Compare before and after" />
    </div>
  );
}

export default function Portfolio() {
  const db = useDB();
  useMeta('portfolio');
  const [params, setParams] = useSearchParams();
  const [cat, setCat] = useState<string>('All');
  const items = db.portfolio.filter((p) => p.status === 'published').sort((a, b) => Number(b.featured) - Number(a.featured) || b.completedAt.localeCompare(a.completedAt));
  const shown = cat === 'All' ? items : items.filter((p) => p.category === cat);
  const open = items.find((p) => p.id === params.get('p'));
  return (
    <>
      <PageHero background={db.content.pageBackgrounds?.portfolio} eyebrow="Portfolio" title="Projects that keep businesses running." body="A selection of websites, business systems, CCTV installations and network projects we’ve delivered." />
      <Section>
        <Tabs
          value={cat}
          onChange={setCat}
          className="mb-10"
          tabs={[{ value: 'All', label: 'All projects', count: items.length }, ...PORTFOLIO_CATEGORIES.filter((c) => items.some((p) => p.category === c)).map((c) => ({ value: c, label: c, count: items.filter((p) => p.category === c).length }))]}
        />
        {shown.length === 0 ? (
          <p className="py-16 text-center text-slate-500">No published projects in this category yet.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <button key={p.id} type="button" onClick={() => setParams({ p: p.id })} className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-navy-900/60 text-left transition hover:-translate-y-1 hover:border-gold-400/40">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Artwork topic={p.category} image={p.image ?? p.afterImage} label={p.title} className="object-left-top transition duration-500 group-hover:scale-105" />
                  {p.featured && (
                    <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-gold-sheen px-2 py-0.5 text-[10px] font-bold uppercase text-navy-950">
                      <Star className="h-3 w-3" /> Featured
                    </span>
                  )}
                </div>
                <div className="p-6">
                  <Badge tone="gold">{p.category}</Badge>
                  <h3 className="mt-3 font-display text-lg font-semibold text-white group-hover:text-gold-100">{p.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-400">{p.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {p.technologies.slice(0, 3).map((t) => (
                      <span key={t} className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-400">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>
      <CTABand />
      <Modal open={!!open} onClose={() => setParams({})} title={open?.title ?? ''} subtitle={open ? `${open.client} · ${open.category}` : ''} size="lg">
        {open && <ProjectView key={open.id} p={open} />}
      </Modal>
    </>
  );
}

function ProjectView({ p }: { p: PortfolioItem }) {
  const shots = [p.image, ...(p.gallery ?? [])].filter(Boolean) as string[];
  const [i, setI] = useState(0);
  return (
    <div className="space-y-5">
      {p.beforeImage || p.afterImage ? (
        <BeforeAfter before={p.beforeImage} after={p.afterImage ?? p.image} topic={p.category} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-navy-950">
          {shots.length ? <img src={shots[i]} alt={`${p.title} screenshot ${i + 1}`} className="max-h-[60vh] w-full object-contain" /> : <div className="aspect-video"><Artwork topic={p.category} label={p.title} iconSize="h-14 w-14" /></div>}
        </div>
      )}
      {shots.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shots.map((src, k) => (
            <button key={src} type="button" onClick={() => setI(k)} className={cx('h-16 w-28 shrink-0 overflow-hidden rounded-lg border transition', k === i ? 'border-gold-300 ring-2 ring-gold-400/40' : 'border-white/10 opacity-60 hover:opacity-100')} aria-label={`Show screenshot ${k + 1}`}>
              <img src={src} alt="" className="h-full w-full object-cover object-top" />
            </button>
          ))}
        </div>
      )}
      {(p.completedAt || p.location) && (
        <div className="flex flex-wrap gap-4 text-sm text-slate-400">
          {p.completedAt && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-gold-300" /> Completed {fmtDate(p.completedAt)}
            </span>
          )}
          {p.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-gold-300" /> {p.location}
            </span>
          )}
        </div>
      )}
      <p className="leading-relaxed text-slate-300">{p.description}</p>
      {p.technologies.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">Technologies used</p>
          <div className="flex flex-wrap gap-2">
            {p.technologies.map((t) => (
              <span key={t} className="rounded-lg border border-gold-400/20 bg-gold-400/5 px-2.5 py-1 text-xs text-gold-100">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {p.demoUrl && (
        <a href={p.demoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-gold-sheen px-5 py-2.5 text-sm font-semibold text-navy-950 shadow-gold hover:brightness-110">
          Try the live demo <ExternalLink className="h-4 w-4" />
        </a>
      )}
      <div className="rounded-xl border border-white/[0.07] bg-navy-900/60 p-4">
        <p className="mb-3 text-sm text-slate-300">Need something similar?</p>
        <ServiceActions />
      </div>
    </div>
  );
}
