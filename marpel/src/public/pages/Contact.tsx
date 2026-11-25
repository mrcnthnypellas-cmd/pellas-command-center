import { Clock, Facebook, Instagram, Linkedin, Mail, MapPin, MessageCircle, Music2, Phone, Smartphone, Youtube } from 'lucide-react';
import { useMeta } from '../../components/brand';
import { Button, SimBadge } from '../../components/ui';
import { useDB } from '../../lib/store';
import { cx, fmtTime } from '../../lib/utils';
import { openChat } from '../ChatWidget';
import { InquiryForm, PageHero, Section } from '../sections';

export default function Contact() {
  const db = useDB();
  useMeta('contact');
  const s = db.settings;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const socials = [
    { href: s.socials.facebook, icon: Facebook, label: 'Facebook' },
    { href: s.socials.instagram, icon: Instagram, label: 'Instagram' },
    { href: s.socials.linkedin, icon: Linkedin, label: 'LinkedIn' },
    { href: s.socials.youtube, icon: Youtube, label: 'YouTube' },
    { href: s.socials.tiktok, icon: Music2, label: 'TikTok' },
  ].filter((x) => x.href);
  return (
    <>
      <PageHero eyebrow="Contact" title="We’d love to hear about your project." body="Call, email, chat with us, or send the form below. We usually respond within one business day." />
      <Section>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Mail, label: 'Business email', value: s.email, href: `mailto:${s.email}` },
            { icon: Phone, label: 'Business phone', value: s.phone, href: `tel:${s.phone.replace(/[^\d+]/g, '')}` },
            { icon: Smartphone, label: 'Mobile', value: s.mobile, href: `tel:${s.mobile.replace(/\s/g, '')}` },
            { icon: MapPin, label: 'Address', value: `${s.address}, ${s.city}` },
          ].map((x) => (
            <div key={x.label} className="rounded-2xl border border-white/[0.07] bg-navy-900/60 p-6">
              <x.icon className="h-6 w-6 text-gold-300" />
              <p className="mt-4 text-xs uppercase tracking-wider text-slate-500">{x.label}</p>
              {x.href ? (
                <a href={x.href} className="mt-1 block break-words text-slate-100 hover:text-gold-200">
                  {x.value}
                </a>
              ) : (
                <p className="mt-1 text-slate-100">{x.value}</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6 sm:p-8">
            <h2 className="font-display text-2xl font-semibold text-white">Send us a message</h2>
            <p className="mb-6 mt-1 text-sm text-slate-400">Need a detailed quote? Use the full quotation form for attachments, budget and schedule.</p>
            <InquiryForm compact />
          </div>
          <div className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-navy-900/60">
              <div className="relative aspect-[4/3] bg-navy-800">
                {/* Google Maps placeholder — production embeds the Maps Embed API iframe for settings.mapQuery */}
                <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" aria-hidden>
                  <rect width="400" height="300" fill="#0d1a30" />
                  {[40, 95, 150, 205, 260].map((y) => (
                    <path key={y} d={`M0 ${y} Q 200 ${y + (y % 3 ? 18 : -14)} 400 ${y}`} stroke="#1b2b4d" strokeWidth="9" fill="none" />
                  ))}
                  {[60, 160, 250, 330].map((x) => (
                    <path key={x} d={`M${x} 0 L ${x + 20} 300`} stroke="#1b2b4d" strokeWidth="7" />
                  ))}
                  <path d="M0 180 C 120 120, 220 240, 400 150" stroke="#2f4c87" strokeWidth="14" fill="none" opacity=".6" />
                </svg>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
                  <MapPin className="h-10 w-10 fill-gold-400 text-navy-950 drop-shadow-lg" />
                </div>
                <div className="absolute left-3 top-3">
                  <SimBadge>Google Maps placeholder</SimBadge>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <p className="text-sm text-slate-300">{s.mapQuery}</p>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.mapQuery)}`} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline">
                    Open in Maps
                  </Button>
                </a>
              </div>
            </div>
            <div className="rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6">
              <h3 className="flex items-center gap-2 font-display font-semibold text-white">
                <Clock className="h-5 w-5 text-gold-300" /> Operating hours
              </h3>
              <ul className="mt-4 space-y-1.5 text-sm">
                {s.hours.map((h) => (
                  <li key={h.day} className={cx('flex justify-between rounded-lg px-2 py-1', h.day === today && 'bg-gold-400/10 text-gold-100')}>
                    <span>{h.day}</span>
                    <span className={h.closed ? 'text-slate-500' : ''}>{h.closed ? 'Closed' : `${fmtTime(h.open)} – ${fmtTime(h.close)}`}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6">
              <h3 className="font-display font-semibold text-white">Follow us</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {socials.map(({ href, icon: I, label }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:border-gold-400/50 hover:text-gold-200">
                    <I className="h-4 w-4" /> {label}
                  </a>
                ))}
              </div>
              <Button variant="gold" className="mt-5 w-full" icon={<MessageCircle className="h-4 w-4" />} onClick={() => openChat('live')}>
                Start a live chat
              </Button>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
