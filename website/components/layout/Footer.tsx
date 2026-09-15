import { Facebook } from 'lucide-react';
import { company } from '@/data/company';
import { contact } from '@/data/contact';
import { navLinks } from '@/data/nav';
import { services } from '@/data/services';
import { Container } from '@/components/ui/Container';
import { Logo } from './Logo';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-navy-950 pt-20 text-ivory">
      <Container>
        <div className="grid grid-cols-1 gap-12 pb-16 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-navy-300">
              {company.name} — {company.designation}. {company.heroDescription}
            </p>
            <a
              href={contact.social.facebook}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Pellas & Associates on Facebook"
              className="mt-6 inline-flex h-10 w-10 items-center justify-center border border-ivory/15 text-ivory/70 transition-colors duration-200 hover:border-gold-400 hover:text-gold-400"
            >
              <Facebook size={18} strokeWidth={1.5} />
            </a>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest2 text-gold-400">Navigation</h3>
            <ul className="mt-5 space-y-3">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-navy-300 transition-colors hover:text-ivory">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest2 text-gold-400">Services</h3>
            <ul className="mt-5 space-y-3">
              {services.slice(0, 5).map((service) => (
                <li key={service.slug}>
                  <a href="#services" className="text-sm text-navy-300 transition-colors hover:text-ivory">
                    {service.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest2 text-gold-400">Contact</h3>
            <ul className="mt-5 space-y-3 text-sm text-navy-300">
              <li>{contact.address.line1}</li>
              <li>{contact.address.line2}</li>
              <li>{contact.address.country}</li>
              <li className="pt-2">
                <a href={`tel:${contact.phones[0].replace(/[^\d+]/g, '')}`} className="hover:text-ivory">
                  {contact.phones[0]}
                </a>
              </li>
              <li>
                <a href={`mailto:${contact.email}`} className="hover:text-ivory">
                  {contact.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-ivory/10 py-8 sm:flex-row">
          <p className="text-xs text-navy-400">
            © {year} {company.name.replace(/\.$/, '')}. All rights reserved.
          </p>
          <div className="flex gap-6 text-xs text-navy-400">
            <a href="#" className="hover:text-ivory">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-ivory">
              Terms &amp; Conditions
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
