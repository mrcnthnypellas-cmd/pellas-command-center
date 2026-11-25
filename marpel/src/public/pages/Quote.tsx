import { CheckCircle2, Clock, FileText, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useMeta } from '../../components/brand';
import { useDB } from '../../lib/store';
import { InquiryForm, PageHero, Section } from '../sections';

export default function Quote() {
  const db = useDB();
  useMeta('quote');
  const [params] = useSearchParams();
  const svc = db.services.find((s) => s.slug === params.get('service'));
  const pkg = params.get('package');
  return (
    <>
      <PageHero eyebrow="Request a quotation" title="Tell us about your project." body="The more detail you share, the more accurate our quotation. Attach floor plans, photos or references if you have them." />
      <Section>
        <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6 sm:p-8">
            {pkg && (
              <p className="mb-6 rounded-xl border border-gold-400/25 bg-gold-400/5 px-4 py-3 text-sm text-gold-100">
                Package selected: <strong>{pkg}</strong> — mention any changes in your description.
              </p>
            )}
            <InquiryForm defaultService={svc?.name} />
          </div>
          <aside className="space-y-5">
            <div className="rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6">
              <h3 className="font-display font-semibold text-white">What happens next</h3>
              <ol className="mt-5 space-y-5">
                {[
                  { icon: FileText, t: 'You receive a reference number', d: 'Instantly, plus a confirmation email.' },
                  { icon: Clock, t: 'We review within 1 business day', d: 'An engineer may call to clarify details or schedule a site inspection.' },
                  { icon: CheckCircle2, t: 'You receive an itemised quotation', d: 'Equipment, materials and labor listed separately with clear terms.' },
                ].map((x) => (
                  <li key={x.t} className="flex gap-3">
                    <x.icon className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
                    <div>
                      <p className="text-sm font-medium text-white">{x.t}</p>
                      <p className="text-xs text-slate-400">{x.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex gap-3 rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6 text-sm text-slate-400">
              <ShieldCheck className="h-5 w-5 shrink-0 text-gold-300" />
              Files you upload are only visible to our team and are used solely to prepare your quotation.
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
