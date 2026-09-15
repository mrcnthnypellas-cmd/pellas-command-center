import { company } from '@/data/company';
import { values } from '@/data/values';
import { Container } from '@/components/ui/Container';
import { AnimateIn } from '@/components/ui/AnimateIn';
import { PlaceholderImage } from '@/components/ui/PlaceholderImage';

export function AboutSection() {
  const [headlineTop, headlineBottom] = company.aboutHeadline.split('\n');

  return (
    <section id="about" className="bg-ivory py-24 sm:py-32">
      <Container>
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <AnimateIn>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest2 text-gold-600">About Us</p>
              <h2 className="font-serif text-3xl leading-tight text-navy-950 sm:text-4xl">
                {headlineTop}
                <br />
                {headlineBottom}
              </h2>
            </AnimateIn>

            <div className="mt-8 space-y-5">
              {company.aboutStory.map((paragraph, i) => (
                <AnimateIn key={i} delay={0.05 * (i + 1)}>
                  <p className="text-base leading-relaxed text-navy-600">{paragraph}</p>
                </AnimateIn>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4">
            <AnimateIn delay={0.1}>
              <PlaceholderImage
                file="about.jpg"
                label="Office / team photography"
                className="aspect-[4/5] w-full"
              />
            </AnimateIn>
          </div>

          <div className="lg:col-span-3">
            <AnimateIn delay={0.15} className="h-full border border-navy-900/10 bg-navy-950 p-8">
              <h3 className="font-serif text-xl text-ivory">Our Values</h3>
              <ul className="mt-6 space-y-5">
                {values.map((value) => (
                  <li key={value.name} className="border-l-2 border-gold-500 pl-4">
                    <p className="text-sm font-semibold text-gold-400">{value.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-navy-300">{value.description}</p>
                  </li>
                ))}
              </ul>
            </AnimateIn>
          </div>
        </div>
      </Container>
    </section>
  );
}
