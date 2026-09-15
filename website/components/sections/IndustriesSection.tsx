import { industries } from '@/data/industries';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { AnimateIn } from '@/components/ui/AnimateIn';
import { PlaceholderImage } from '@/components/ui/PlaceholderImage';

export function IndustriesSection() {
  return (
    <section id="industries" className="bg-navy-950 py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow="Who We Serve"
          title="We Serve a Wide Range of Industries"
          description="Practical accounting and advisory support for individuals, businesses, and organizations of different shapes and sizes."
          light
        />

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((industry, i) => (
            <AnimateIn key={industry.name} delay={(i % 3) * 0.08}>
              <div className="group relative overflow-hidden border border-ivory/10">
                <PlaceholderImage
                  file={industry.image.split('/').pop() ?? 'industry.jpg'}
                  label={industry.name}
                  className="aspect-[4/3] w-full transition-transform duration-500 ease-premium group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6">
                  <h3 className="font-serif text-lg text-ivory">{industry.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-navy-300">{industry.description}</p>
                </div>
              </div>
            </AnimateIn>
          ))}
        </div>
      </Container>
    </section>
  );
}
