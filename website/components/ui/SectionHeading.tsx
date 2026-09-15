import { cn } from '@/lib/utils';
import { AnimateIn } from './AnimateIn';

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  light = false,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  light?: boolean;
  className?: string;
}) {
  return (
    <AnimateIn
      className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}
    >
      {eyebrow && (
        <p
          className={cn(
            'mb-4 text-xs font-semibold uppercase tracking-widest2',
            light ? 'text-gold-400' : 'text-gold-600'
          )}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={cn(
          'font-serif text-3xl leading-tight sm:text-4xl lg:text-[2.75rem] text-balance',
          light ? 'text-ivory' : 'text-navy-950'
        )}
      >
        {title}
      </h2>
      {description && (
        <p className={cn('mt-5 text-base leading-relaxed sm:text-lg', light ? 'text-navy-200' : 'text-navy-600')}>
          {description}
        </p>
      )}
    </AnimateIn>
  );
}
