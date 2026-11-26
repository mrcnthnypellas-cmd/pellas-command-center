import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LogoMark } from '../components/brand';
import { useDB } from '../lib/store';
import { cx } from '../lib/utils';

type Phase = 'idle' | 'show' | 'hide';

/**
 * Branded page-transition screen: on first load and whenever a visitor moves to
 * another page, a full-screen Marpel splash appears, the logo fades in, then the
 * splash fades away to reveal the new page. Toggle in Admin → Business Settings.
 */
export default function PageLoader() {
  const { settings } = useDB();
  const enabled = settings.pageLoader !== false;
  const { pathname } = useLocation();
  const [phase, setPhase] = useState<Phase>(enabled ? 'show' : 'idle');
  const [cycle, setCycle] = useState(0);
  const first = useRef(true);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) {
      setPhase('idle');
      return;
    }
    if (!first.current) setCycle((c) => c + 1);
    first.current = false;
    timers.current.forEach(clearTimeout);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hold = reduced ? 300 : 950;
    setPhase('show');
    timers.current = [window.setTimeout(() => setPhase('hide'), hold), window.setTimeout(() => setPhase('idle'), hold + 450)];
    return () => timers.current.forEach(clearTimeout);
  }, [pathname, enabled]);

  if (phase === 'idle') return null;
  const [first1, ...rest] = settings.businessName.split(' ');
  return (
    <div
      aria-hidden
      className={cx('fixed inset-0 z-[90] flex items-center justify-center bg-navy-950 transition-opacity duration-[450ms] ease-out no-print', phase === 'hide' ? 'pointer-events-none opacity-0' : 'opacity-100')}
    >
      <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-400/10 blur-[110px]" />
      <div key={cycle} className="relative flex animate-loader-in flex-col items-center">
        {settings.logoImage ? (
          <img src={settings.logoImage} alt="" className="h-20 w-auto object-contain" />
        ) : (
          <>
            <LogoMark className="h-16 w-16" />
            <p className="mt-4 font-display text-xl font-bold tracking-[0.32em] text-white">{first1?.toUpperCase()}</p>
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.3em] text-gold-300">{rest.join(' ')}</p>
          </>
        )}
        <span className="mt-6 h-px w-28 overflow-hidden bg-white/10">
          <span className="block h-full w-full origin-left animate-loader-bar bg-gradient-to-r from-gold-600 via-gold-300 to-gold-600" />
        </span>
      </div>
    </div>
  );
}
