import type { CompanyData } from '@/lib/site-content';
import { cn } from '@/lib/utils';

export function Logo({ company, light = true }: { company: CompanyData; light?: boolean }) {
  return (
    <a href="#home" className="group flex items-center gap-3" aria-label={`${company.name} — home`}>
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center border font-serif text-base',
          light ? 'border-gold-400/60 text-gold-400' : 'border-navy-900/30 text-navy-900'
        )}
      >
        {company.logo.initials}
      </span>
      <span className="flex flex-col leading-tight">
        <span className={cn('font-serif text-base tracking-wide', light ? 'text-ivory' : 'text-navy-950')}>
          {company.shortName}
        </span>
        <span
          className={cn(
            'text-[10px] font-medium uppercase tracking-widest2',
            light ? 'text-gold-400/80' : 'text-gold-600'
          )}
        >
          {company.designation}
        </span>
      </span>
    </a>
  );
}
