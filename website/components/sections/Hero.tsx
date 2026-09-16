'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { CompanyData } from '@/lib/site-content';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { PlaceholderImage } from '@/components/ui/PlaceholderImage';

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export function Hero({ company }: { company: CompanyData }) {
  return (
    <section id="home" className="relative flex min-h-[92vh] items-center overflow-hidden bg-navy-950 pt-28">
      <div className="absolute inset-0">
        <PlaceholderImage file="hero.jpg" label="Hero — office / skyline photography" className="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/85 to-navy-950/40" />
      </div>

      <Container className="relative z-10">
        <motion.div initial="hidden" animate="visible" variants={container} className="max-w-3xl">
          <motion.p
            variants={item}
            className="mb-6 text-xs font-semibold uppercase tracking-widest2 text-gold-400"
          >
            {company.taglineEyebrow}
          </motion.p>

          <motion.h1
            variants={item}
            className="font-serif text-4xl leading-[1.1] text-ivory text-balance sm:text-5xl lg:text-6xl"
          >
            {company.tagline}
          </motion.h1>

          <motion.p variants={item} className="mt-7 max-w-xl text-base leading-relaxed text-navy-200 sm:text-lg">
            {company.heroDescription}
          </motion.p>

          <motion.div variants={item} className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button href="#contact" variant="primary">
              Book a Consultation
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
            <Button href="#services" variant="outline-light">
              Explore Our Services
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}
