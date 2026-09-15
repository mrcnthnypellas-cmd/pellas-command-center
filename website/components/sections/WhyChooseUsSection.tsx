import { whyChooseUs } from '@/data/values';
import { Container } from '@/components/ui/Container';
import { AnimateIn } from '@/components/ui/AnimateIn';

export function WhyChooseUsSection() {
  return (
    <section className="bg-navy-50/40 py-24 sm:py-32">
      <Container>
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <AnimateIn>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest2 text-gold-600">Why Choose Us</p>
              <h2 className="font-serif text-3xl leading-tight text-navy-950 sm:text-4xl text-balance">
                A firm that treats your business like it matters.
              </h2>
            </AnimateIn>
          </div>

          <div className="lg:col-span-7">
            <div className="divide-y divide-navy-900/10 border-t border-navy-900/10">
              {whyChooseUs.map((item, i) => (
                <AnimateIn key={item.title} delay={i * 0.08}>
                  <div className="flex flex-col gap-2 py-7 sm:flex-row sm:items-baseline sm:gap-8">
                    <span className="font-serif text-2xl text-gold-500 sm:w-10">0{i + 1}</span>
                    <div>
                      <h3 className="font-serif text-lg text-navy-950">{item.title}</h3>
                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-navy-600">{item.description}</p>
                    </div>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
