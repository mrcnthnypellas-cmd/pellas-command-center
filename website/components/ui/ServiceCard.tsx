'use client';

import { ArrowUpRight, Calculator, ShieldCheck, Receipt, LineChart, Building2, Cloud, Users } from 'lucide-react';
import type { Service } from '@/data/services';
import { AnimateIn } from './AnimateIn';

const icons = {
  Calculator,
  ShieldCheck,
  Receipt,
  LineChart,
  Building2,
  Cloud,
  Users,
};

export function ServiceCard({ service, index }: { service: Service; index: number }) {
  const Icon = icons[service.icon];

  return (
    <AnimateIn delay={(index % 3) * 0.08}>
      <a
        href={`#contact`}
        className="group relative flex h-full flex-col border border-navy-900/10 bg-white p-8 shadow-card transition-all duration-300 ease-premium hover:-translate-y-1 hover:border-gold-500/60"
      >
        <div className="mb-6 flex h-12 w-12 items-center justify-center border border-navy-900/10 text-navy-900 transition-colors duration-300 group-hover:border-gold-500 group-hover:text-gold-600">
          <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h3 className="font-serif text-xl text-navy-950">{service.name}</h3>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-navy-600">{service.description}</p>
        <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-navy-900">
          Learn More
          <ArrowUpRight
            size={16}
            className="transition-transform duration-300 ease-premium group-hover:translate-x-1 group-hover:-translate-y-1"
          />
        </span>
      </a>
    </AnimateIn>
  );
}
