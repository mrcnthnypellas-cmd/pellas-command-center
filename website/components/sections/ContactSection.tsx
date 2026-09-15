import { Mail, MapPin, Phone, Clock, Facebook, type LucideIcon } from 'lucide-react';
import { contact } from '@/data/contact';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { AnimateIn } from '@/components/ui/AnimateIn';
import { ContactForm } from './ContactForm';

export function ContactSection() {
  return (
    <section id="contact" className="bg-ivory py-24 sm:py-32">
      <Container>
        <SectionHeading eyebrow="Get In Touch" title="Let's Talk About Your Business" />

        <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <AnimateIn className="space-y-8">
              <InfoRow icon={MapPin} label="Address">
                <p>{contact.address.line1}</p>
                <p>{contact.address.line2}</p>
                <p>{contact.address.country}</p>
              </InfoRow>

              <InfoRow icon={Phone} label="Phone">
                {contact.phones.map((phone) => (
                  <p key={phone}>
                    <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="hover:text-gold-600">
                      {phone}
                    </a>
                  </p>
                ))}
              </InfoRow>

              <InfoRow icon={Mail} label="Email">
                <a href={`mailto:${contact.email}`} className="hover:text-gold-600">
                  {contact.email}
                </a>
              </InfoRow>

              <InfoRow icon={Clock} label="Business Hours">
                {contact.hours.map((h) => (
                  <p key={h.days}>
                    {h.days}: {h.time}
                  </p>
                ))}
              </InfoRow>

              <InfoRow icon={Facebook} label="Facebook">
                <a
                  href={contact.social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all hover:text-gold-600"
                >
                  Pellas & Associates Co.
                </a>
              </InfoRow>
            </AnimateIn>
          </div>

          <div className="lg:col-span-7">
            <AnimateIn delay={0.1}>
              <ContactForm />
            </AnimateIn>
          </div>
        </div>
      </Container>
    </section>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-navy-900/10 text-navy-900">
        <Icon size={18} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest2 text-navy-400">{label}</p>
        <div className="mt-1.5 space-y-0.5 text-sm leading-relaxed text-navy-700">{children}</div>
      </div>
    </div>
  );
}
