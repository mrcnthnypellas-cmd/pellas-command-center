import { Mail, MapPin, Phone, Smartphone } from 'lucide-react';
import type { Settings } from '../lib/types';
import { cx } from '../lib/utils';
import { LogoMark } from './brand';

/**
 * Official Marpel letterhead / document header.
 * Used at the top of quotations and (later) proposals, and shown in
 * Business Settings → Letterhead. Content comes from Business Settings, so
 * contact changes update every document automatically.
 *  - "dark": navy band with gold accents (digital PDFs, presentations)
 *  - "light": white with navy + gold rules (printer-friendly, saves ink)
 */
export function DocHeader({ s, variant = 'dark', className, motto }: { s: Settings; variant?: 'dark' | 'light'; className?: string; motto?: string }) {
  const dark = variant === 'dark';
  const [first, ...rest] = s.businessName.split(' ');
  const showTin = s.tin && !/^[0\s-]+$/.test(s.tin);
  const contact = [
    { icon: Phone, text: s.phone },
    { icon: Smartphone, text: s.mobile },
    { icon: Mail, text: s.email },
  ].filter((c) => c.text);
  return (
    <div className={cx('relative overflow-hidden', dark ? 'bg-[#08101f] text-white' : 'bg-white text-[#08101f]', className)}>
      {dark && (
        <>
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[#d8ae5a]/[0.16] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-[#2f4c87]/25 blur-3xl" />
        </>
      )}
      {/* network motif: nodes and links, a nod to the IT & networking trade */}
      <svg className="pointer-events-none absolute left-[45%] top-0 h-full w-[19%]" viewBox="0 0 360 140" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <g stroke={dark ? '#d8ae5a' : '#a97d2c'} strokeOpacity={dark ? 0.22 : 0.16} strokeWidth="1" fill="none">
          <path d="M40 120 L110 70 L190 96 L260 40 L340 72" />
          <path d="M110 70 L150 18 L260 40" />
          <path d="M190 96 L230 136" />
        </g>
        {[[40, 120], [110, 70], [190, 96], [260, 40], [340, 72], [150, 18], [230, 136]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 3.2 : 2.4} fill={dark ? '#e3c27a' : '#c99a3e'} fillOpacity={dark ? 0.45 : 0.35} />
        ))}
      </svg>

      <div className="relative flex items-center justify-between gap-8 px-10 py-7">
        <div className="flex items-center gap-4">
          {s.logoImage ? <img src={s.logoImage} alt="" className="h-14 w-auto object-contain" /> : <LogoMark className="h-14 w-14 shrink-0" />}
          <div className="leading-none">
            <p className={cx('font-display text-[26px] font-bold tracking-[0.2em]', dark ? 'text-white' : 'text-[#08101f]')}>{first?.toUpperCase()}</p>
            <p className={cx('mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.3em]', dark ? 'text-[#e3c27a]' : 'text-[#a97d2c]')}>{rest.join(' ')}</p>
            <p className={cx('mt-2 text-[10.5px] tracking-wide', dark ? 'text-slate-400' : 'text-slate-500')}>{s.tagline}</p>
            {motto && <p className={cx('mt-2 font-display text-[10.5px] italic', dark ? 'text-[#e3c27a]' : 'text-[#a97d2c]')}>“{motto}”</p>}
          </div>
        </div>
        <div className={cx('space-y-1 text-right text-[10.5px] leading-snug', dark ? 'text-slate-300' : 'text-slate-600')}>
          {contact.map(({ icon: I, text }) => (
            <p key={text} className="flex items-center justify-end gap-1.5">
              {text}
              <I className={cx('h-3 w-3 shrink-0', dark ? 'text-[#e3c27a]' : 'text-[#a97d2c]')} />
            </p>
          ))}
          <p className="flex items-start justify-end gap-1.5">
            <span className="max-w-[230px]">
              {s.address}, {s.city}
            </span>
            <MapPin className={cx('mt-0.5 h-3 w-3 shrink-0', dark ? 'text-[#e3c27a]' : 'text-[#a97d2c]')} />
          </p>
          {showTin && <p className={dark ? 'text-slate-500' : 'text-slate-400'}>TIN {s.tin}</p>}
        </div>
      </div>
      {dark ? (
        <div className="relative h-[5px] bg-gradient-to-r from-[#a97d2c] via-[#f5e9c8] to-[#a97d2c]" />
      ) : (
        <div className="relative px-10">
          <div className="h-[3px] bg-[#08101f]" />
          <div className="mt-[3px] h-px bg-gradient-to-r from-[#a97d2c] via-[#e3c27a] to-[#a97d2c]" />
        </div>
      )}
    </div>
  );
}
