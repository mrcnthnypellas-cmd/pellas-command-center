import { ArrowRight, ChevronDown, Clock, Facebook, FlaskConical, Instagram, Linkedin, Mail, MapPin, Menu, Music2, Phone, RotateCcw, Shield, X, Youtube } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/brand';
import { Icon } from '../components/icons';
import { Button, Modal } from '../components/ui';
import { useDB, useStore, useToast } from '../lib/store';
import { cx, fmtTime } from '../lib/utils';
import ChatWidget from './ChatWidget';
import PageLoader from './PageLoader';

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/services', label: 'Services', mega: true },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/blog', label: 'Blog' },
  { to: '/contact', label: 'Contact' },
];

function Header() {
  const db = useDB();
  const [open, setOpen] = useState(false);
  const [mega, setMega] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const services = db.services.filter((s) => s.status === 'published').sort((a, b) => a.order - b.order);
  const bar = db.content.announcementBar;

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    setOpen(false);
    setMega(false);
  }, [loc.pathname]);

  return (
    <>
      {bar.enabled && bar.text && (
        <div className="relative z-50 bg-gold-sheen px-4 py-2 text-center text-xs font-medium text-navy-950">
          <button type="button" onClick={() => nav(bar.link || '/contact')} className="inline-flex items-center gap-1.5 hover:underline">
            {bar.text} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <header className={cx('sticky top-0 z-40 transition-all duration-300', scrolled ? 'border-b border-white/[0.06] bg-navy-950/85 backdrop-blur-xl' : 'bg-transparent')}>
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-6 px-5 lg:px-8">
          <Link to="/" aria-label="Home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((n) =>
              n.mega ? (
                <div key={n.to} className="relative" onMouseEnter={() => setMega(true)} onMouseLeave={() => setMega(false)}>
                  <NavLink to={n.to} className={({ isActive }) => cx('flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition', isActive ? 'text-gold-200' : 'text-slate-300 hover:text-white')}>
                    {n.label} <ChevronDown className={cx('h-3.5 w-3.5 transition', mega && 'rotate-180')} />
                  </NavLink>
                  {mega && (
                    <div className="absolute left-1/2 top-full w-[620px] -translate-x-1/2 pt-3">
                      <div className="grid animate-fade-up grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-navy-900/95 p-3 shadow-2xl backdrop-blur-xl">
                        {services.map((s) => (
                          <Link key={s.id} to={`/services/${s.slug}`} className="group flex gap-3 rounded-xl p-3 transition hover:bg-white/5">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold-400/25 bg-gold-400/10 text-gold-200">
                              <Icon name={s.icon} className="h-5 w-5" />
                            </span>
                            <span>
                              <span className="block text-sm font-medium text-white group-hover:text-gold-100">{s.name}</span>
                              <span className="mt-0.5 line-clamp-2 block text-xs text-slate-400">{s.short}</span>
                            </span>
                          </Link>
                        ))}
                        <Link to="/services" className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/10 p-3 text-sm text-gold-200 hover:bg-white/5">
                          View all services <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('rounded-lg px-3 py-2 text-sm transition', isActive ? 'text-gold-200' : 'text-slate-300 hover:text-white')}>
                  {n.label}
                </NavLink>
              ),
            )}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <Link to="/track" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white">
              Track Project
            </Link>
            <Button variant="gold" onClick={() => nav('/quote')}>
              Request a Quote
            </Button>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-200 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-[86%] max-w-sm animate-fade-in flex-col border-l border-white/10 bg-navy-900 p-5">
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-300" aria-label="Close menu">
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Mobile">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('rounded-xl px-4 py-3 text-base', isActive ? 'bg-gold-400/10 text-gold-100' : 'text-slate-200')}>
                  {n.label}
                </NavLink>
              ))}
              <div className="my-2 gold-hairline" />
              {services.map((s) => (
                <Link key={s.id} to={`/services/${s.slug}`} className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-slate-300">
                  <Icon name={s.icon} className="h-4 w-4 text-gold-300" /> {s.name}
                </Link>
              ))}
              <div className="my-2 gold-hairline" />
              <Link to="/track" className="rounded-xl px-4 py-3 text-slate-200">
                Track Project
              </Link>
              <Link to="/book" className="rounded-xl px-4 py-3 text-slate-200">
                Book a Consultation
              </Link>
            </nav>
            <Button variant="gold" size="lg" className="mt-4 w-full" onClick={() => nav('/quote')}>
              Request a Quote
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function Footer() {
  const db = useDB();
  const s = db.settings;
  const socials = [
    { href: s.socials.facebook, icon: Facebook, label: 'Facebook' },
    { href: s.socials.instagram, icon: Instagram, label: 'Instagram' },
    { href: s.socials.linkedin, icon: Linkedin, label: 'LinkedIn' },
    { href: s.socials.youtube, icon: Youtube, label: 'YouTube' },
    { href: s.socials.tiktok, icon: Music2, label: 'TikTok' },
  ].filter((x) => x.href);
  const open = s.hours.filter((h) => !h.closed);
  return (
    <footer className="relative mt-24 border-t border-white/[0.06] bg-navy-950">
      <div className="gold-hairline absolute inset-x-0 top-0" />
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:grid-cols-2 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-4">
          <Logo />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-400">{db.content.footer.blurb}</p>
          {db.content.motto && <p className="mt-4 max-w-sm font-display text-sm italic text-gold-200/90">“{db.content.motto}”</p>}
          <div className="mt-6 flex gap-2">
            {socials.map(({ href, icon: I, label }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:border-gold-400/50 hover:text-gold-200">
                <I className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
        <div className="lg:col-span-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">Services</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            {db.services
              .filter((x) => x.status === 'published')
              .sort((a, b) => a.order - b.order)
              .map((x) => (
                <li key={x.id}>
                  <Link to={`/services/${x.slug}`} className="text-slate-400 hover:text-white">
                    {x.name}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
        <div className="lg:col-span-2">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">Company</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              ['/about', 'About Us'],
              ['/portfolio', 'Portfolio'],
              ['/blog', 'Blog & News'],
              ['/quote', 'Request a Quote'],
              ['/book', 'Book a Consultation'],
              ['/track', 'Track Your Project'],
              ['/contact', 'Contact'],
            ].map(([to, l]) => (
              <li key={to}>
                <Link to={to!} className="text-slate-400 hover:text-white">
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 text-sm text-slate-400 lg:col-span-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">Get in touch</h4>
          <p className="flex gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
            {s.address}, {s.city}
          </p>
          <a href={`tel:${s.mobile.replace(/\s/g, '')}`} className="flex gap-2.5 hover:text-white">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
            {s.phone} · {s.mobile}
          </a>
          <a href={`mailto:${s.email}`} className="flex gap-2.5 hover:text-white">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
            {s.email}
          </a>
          <p className="flex gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
            <span>
              {open[0] ? `${open[0].day.slice(0, 3)}–${open[open.length - 2]?.day.slice(0, 3) ?? ''} ${fmtTime(open[0].open)}–${fmtTime(open[0].close)}` : 'By appointment'}
              {open.length > 5 && open[open.length - 1] && (
                <>
                  <br />
                  {open[open.length - 1]!.day.slice(0, 3)} {fmtTime(open[open.length - 1]!.open)}–{fmtTime(open[open.length - 1]!.close)}
                </>
              )}
            </span>
          </p>
        </div>
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-slate-500 sm:flex-row lg:px-8">
          <p>{db.content.footer.copyright.replace('{year}', String(new Date().getFullYear()))}</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Your information is handled under the Data Privacy Act of 2012.
            </span>
            <Link to="/admin/login" className="hover:text-gold-200">
              Staff login
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** Floating reviewer toolbar — exists only in the prototype. */
function PrototypeBar() {
  const { reset } = useStore();
  const { push } = useToast();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [min, setMin] = useState(() => {
    const saved = sessionStorage.getItem('marpel.protobar');
    return saved === null ? window.innerWidth < 640 : saved === 'min';
  });
  const toggle = () => {
    sessionStorage.setItem('marpel.protobar', min ? 'open' : 'min');
    setMin(!min);
  };
  return (
    <>
      <div className="fixed bottom-4 left-4 z-40 flex items-center gap-1 rounded-full border border-violet-400/30 bg-navy-900/90 p-1 pl-3 text-xs shadow-2xl backdrop-blur no-print">
        <button type="button" onClick={toggle} className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-violet-200" title="Show / hide prototype tools">
          <FlaskConical className="h-3.5 w-3.5" /> Prototype
        </button>
        {!min && (
          <>
            <button type="button" onClick={() => nav('/admin')} className="ml-1 rounded-full px-3 py-1.5 text-slate-200 hover:bg-white/10">
              Admin dashboard
            </button>
            <button type="button" onClick={() => setConfirm(true)} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Restore sample data">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </>
        )}
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reset prototype data?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              onClick={() => {
                reset();
                setConfirm(false);
                push({ tone: 'success', title: 'Sample data restored' });
              }}
            >
              Reset data
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">All changes made in this browser (inquiries, edits, chats, uploads) will be replaced with the original sample data.</p>
      </Modal>
    </>
  );
}

export default function PublicLayout() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <PageLoader />
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <ChatWidget />
      <PrototypeBar />
    </div>
  );
}
