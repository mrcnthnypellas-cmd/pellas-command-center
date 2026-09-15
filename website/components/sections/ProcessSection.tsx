import { processSteps } from '@/data/process';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { AnimateIn } from '@/components/ui/AnimateIn';

export function ProcessSection() {
  return (
    <section id="process" className="bg-ivory py-24 sm:py-32">
      <Container>
        <SectionHeading eyebrow="Our Approach" title="How We Work" align="center" className="mx-auto" />

        <div className="mt-16 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
          {processSteps.map((step, i) => (
            <AnimateIn key={step.number} delay={i * 0.1} className="relative">
              <div className="flex flex-col gap-4 border-t-2 border-navy-900/10 pt-6 lg:border-t-2">
                <span className="font-serif text-4xl text-gold-500">{step.number}</span>
                <h3 className="font-serif text-lg text-navy-950">{step.title}</h3>
                <p className="text-sm leading-relaxed text-navy-600">{step.description}</p>
              </div>
              {i < processSteps.length - 1 && (
                <span className="absolute right-0 top-6 hidden h-px w-6 -translate-y-1/2 bg-navy-900/10 lg:block" />
              )}
            </AnimateIn>
          ))}
        </div>
      </Container>
    </section>
  );
}
