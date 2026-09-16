'use client';

import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { navLinks } from '@/data/nav';
import type { CompanyData } from '@/lib/site-content';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { Logo } from './Logo';
import { cn } from '@/lib/utils';

export function Navbar({ company }: { company: CompanyData }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [barHeight, setBarHeight] = useState(80);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (barRef.current) setBarHeight(barRef.current.offsetHeight);
  }, [scrolled]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-premium',
          scrolled
            ? 'bg-navy-950/90 shadow-elegant backdrop-blur-md'
            : 'bg-navy-950/40 backdrop-blur-sm'
        )}
      >
      <Container>
        <div
          ref={barRef}
          className={cn(
            'flex items-center justify-between transition-all duration-300 ease-premium',
            scrolled ? 'py-3' : 'py-5'
          )}
        >
          <Logo company={company} />

          <nav className="hidden items-center gap-9 lg:flex" aria-label="Primary">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-ivory/80 transition-colors duration-200 hover:text-gold-400"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:block">
            <Button href="#contact" variant="primary">
              Book a Consultation
            </Button>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center p-2 text-ivory lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </Container>
      </header>

      <div
        id="mobile-menu"
        style={{ top: barHeight }}
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 overflow-y-auto bg-navy-950 transition-opacity duration-300 ease-premium lg:hidden',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <Container className="flex flex-col gap-1 pb-8 pt-2">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="border-b border-ivory/10 py-4 text-base font-medium text-ivory/90"
            >
              {link.label}
            </a>
          ))}
          <div className="pt-5">
            <Button href="#contact" variant="primary" onClick={() => setOpen(false)} className="w-full justify-center">
              Book a Consultation
            </Button>
          </div>
        </Container>
      </div>
    </>
  );
}
