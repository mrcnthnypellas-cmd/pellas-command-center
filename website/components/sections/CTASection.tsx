import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { AnimateIn } from '@/components/ui/AnimateIn';
import { PlaceholderImage } from '@/components/ui/PlaceholderImage';

export function CTASection() {
  return (
    <section className="relative overflow-hidden py-28 sm:py-36">
      <PlaceholderImage file="cta.jpg" label="CTA — city skyline / office" className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-navy-950/85" />

      <Container className="relative z-10">
        <AnimateIn className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-3xl leading-tight text-ivory text-balance sm:text-4xl lg:text-5xl">
            Let&rsquo;s Make Your Numbers Work for Your Business.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-navy-200 sm:text-lg">
            Whether you need accounting, tax, audit, or advisory support, let&rsquo;s discuss how we can help your
            business.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Button href="#contact" variant="primary">
              Book a Consultation
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
            <Button href="#contact" variant="outline-light">
              Contact Us
            </Button>
          </div>
        </AnimateIn>
      </Container>
    </section>
  );
}
