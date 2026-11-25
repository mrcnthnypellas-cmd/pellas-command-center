import { CheckCircle2, Eye, Target } from 'lucide-react';
import { Logo, useMeta } from '../../components/brand';
import { Icon } from '../../components/icons';
import { useDB } from '../../lib/store';
import { CTABand, PageHero, Section, SectionHeading, ServiceActions } from '../sections';

export default function About() {
  const db = useDB();
  useMeta('about');
  const a = db.content.about;
  return (
    <>
      <PageHero eyebrow="About us" title={a.headline} body={a.profile}>
        <ServiceActions className="mt-8" />
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading align="left" eyebrow="Our story" title="From neighborhood installer to full-service technology partner." />
            <p className="whitespace-pre-line text-base leading-relaxed text-slate-400">{a.background}</p>
            <div className="mt-8 flex items-center gap-6 rounded-2xl border border-white/[0.07] bg-navy-900/60 p-5">
              <Logo />
              <div className="h-10 w-px bg-white/10" />
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">Serving clients since</p>
                <p className="font-display text-2xl font-semibold text-gold-200">{a.founded}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-5">
            <div className="rounded-2xl border border-gold-400/25 bg-gradient-to-br from-gold-400/10 to-transparent p-7">
              <Target className="h-7 w-7 text-gold-300" />
              <h3 className="mt-4 font-display text-xl font-semibold text-white">Our mission</h3>
              <p className="mt-2 leading-relaxed text-slate-300">{a.mission}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-navy-900/60 p-7">
              <Eye className="h-7 w-7 text-gold-300" />
              <h3 className="mt-4 font-display text-xl font-semibold text-white">Our vision</h3>
              <p className="mt-2 leading-relaxed text-slate-300">{a.vision}</p>
            </div>
          </div>
        </div>
      </Section>

      <div className="border-y border-white/[0.05] bg-navy-900/40">
        <Section>
          <SectionHeading eyebrow="Core values" title="What we stand for." />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {a.values.map((v) => (
              <div key={v.id} className="rounded-2xl border border-white/[0.07] bg-navy-950/70 p-6 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-400/25 bg-gold-400/10 text-gold-200">
                  <Icon name={v.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-white">{v.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{v.desc}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section>
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading align="left" eyebrow="Capabilities" title="Professional capabilities" />
            <ul className="space-y-3">
              {a.capabilities.map((c) => (
                <li key={c} className="flex gap-3 rounded-xl border border-white/[0.06] bg-navy-900/50 p-4 text-slate-300">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" /> {c}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionHeading align="left" eyebrow="Why customers choose us" title="The Marpel difference" />
            <ul className="space-y-3">
              {a.whyUs.map((c, i) => (
                <li key={c} className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-navy-900/50 p-4 text-slate-300">
                  <span className="font-display text-2xl font-semibold text-gold-400/60">{String(i + 1).padStart(2, '0')}</span> {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
      <CTABand />
    </>
  );
}
