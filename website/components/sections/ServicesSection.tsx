import type { Service } from '@/data/services';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ServiceCard } from '@/components/ui/ServiceCard';

export function ServicesSection({ services }: { services: Service[] }) {
  return (
    <section id="services" className="bg-navy-50/40 py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow="What We Do"
          title="Comprehensive Solutions for Your Business"
          description="From day-to-day bookkeeping to audit, tax, and business registration — practical accounting support built around how your business actually runs."
        />

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, i) => (
            <ServiceCard key={service.slug} service={service} index={i} />
          ))}
        </div>
      </Container>
    </section>
  );
}
