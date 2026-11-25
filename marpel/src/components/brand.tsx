import { useEffect } from 'react';
import { useDB } from '../lib/store';
import { cx } from '../lib/utils';
import { Icon } from './icons';

/** Editable logo concept: monogram "M" drawn as a network path with a node. Replaceable via Business Settings → Logo. */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f5e9c8" />
          <stop offset=".5" stopColor="#d8ae5a" />
          <stop offset="1" stopColor="#a97d2c" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="15" fill="#08101f" stroke="url(#lm-g)" strokeOpacity=".55" strokeWidth="1.5" />
      <path d="M15 46V19l17 15 17-15v27" fill="none" stroke="url(#lm-g)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="34" r="3.6" fill="#f5e9c8" />
      <circle cx="15" cy="46" r="2.4" fill="#d8ae5a" />
      <circle cx="49" cy="46" r="2.4" fill="#d8ae5a" />
    </svg>
  );
}

export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  const s = useDB().settings;
  if (s.logoImage) {
    return <img src={s.logoImage} alt={s.businessName} className={cx('h-10 w-auto object-contain', className)} />;
  }
  const [first, ...rest] = s.businessName.split(' ');
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[17px] font-bold tracking-[0.14em] text-white">{first?.toUpperCase()}</span>
          <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.22em] text-gold-300">{rest.join(' ') || s.tagline}</span>
        </span>
      )}
    </span>
  );
}

/** Generated artwork used whenever no photo has been uploaded for a service / project / post. */
const ART: Record<string, { from: string; to: string; icon: string }> = {
  'Website Development': { from: '#13305f', to: '#08101f', icon: 'Globe' },
  'Software Development': { from: '#2b2160', to: '#08101f', icon: 'Code2' },
  'CCTV and Security Systems': { from: '#4a2f12', to: '#08101f', icon: 'Cctv' },
  'CCTV Installation': { from: '#4a2f12', to: '#08101f', icon: 'Cctv' },
  'MikroTik and Network Solutions': { from: '#0f3d3a', to: '#08101f', icon: 'Router' },
  'MikroTik Configuration': { from: '#0f3d3a', to: '#08101f', icon: 'Router' },
  'IT Infrastructure and Technical Services': { from: '#1d3348', to: '#08101f', icon: 'Server' },
  'Network Infrastructure': { from: '#1d3348', to: '#08101f', icon: 'Network' },
  'IT Projects': { from: '#3a1d3f', to: '#08101f', icon: 'Wrench' },
};

export function Artwork({ topic, image, className, label, iconSize = 'h-10 w-10' }: { topic: string; image?: string; className?: string; label?: string; iconSize?: string }) {
  if (image) return <img src={image} alt={label ?? topic} className={cx('h-full w-full object-cover', className)} loading="lazy" />;
  const a = ART[topic] ?? { from: '#1b2b4d', to: '#08101f', icon: 'Sparkles' };
  return (
    <div className={cx('relative flex h-full w-full items-center justify-center overflow-hidden', className)} style={{ background: `radial-gradient(120% 120% at 20% 0%, ${a.from} 0%, ${a.to} 70%)` }} role="img" aria-label={label ?? topic}>
      <div className="absolute inset-0 bg-grid-faint [background-size:28px_28px] opacity-70" />
      <svg className="absolute inset-0 h-full w-full opacity-40" viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <g stroke="#d8ae5a" strokeOpacity=".35" fill="none">
          <path d="M-10 170 C 80 120, 140 200, 230 140 S 360 80, 420 110" />
          <path d="M-10 60 C 70 90, 160 20, 250 70 S 360 150, 420 120" strokeOpacity=".18" />
        </g>
        {[[60, 140], [140, 165], [230, 140], [320, 100], [250, 70], [160, 40]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill="#e3c27a" fillOpacity=".7" />
        ))}
      </svg>
      <div className="relative rounded-2xl border border-gold-300/30 bg-navy-950/40 p-4 text-gold-200 shadow-gold backdrop-blur-sm">
        <Icon name={a.icon} className={iconSize} />
      </div>
    </div>
  );
}

/** Sets document title + meta description (SEO foundation; SSR/SSG in production). */
export function useMeta(key: string, override?: { title?: string; description?: string }) {
  const seo = useDB().content.seo[key];
  const title = override?.title ?? seo?.title;
  const description = override?.description ?? seo?.description;
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) {
        m = document.createElement('meta');
        m.setAttribute('name', 'description');
        document.head.appendChild(m);
      }
      m.setAttribute('content', description);
      document.querySelector('meta[property="og:title"]')?.setAttribute('content', title ?? '');
      document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    }
  }, [title, description]);
}
