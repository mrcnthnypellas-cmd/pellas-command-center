import Link from 'next/link';
import { cn } from '@/lib/utils';

type ButtonProps = {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline-light';
  className?: string;
  onClick?: () => void;
};

const variants = {
  primary:
    'bg-gold-500 text-navy-950 hover:bg-gold-400 focus-visible:ring-offset-navy-900',
  secondary:
    'bg-transparent text-navy-900 border border-navy-900/20 hover:border-navy-900 hover:bg-navy-900 hover:text-ivory',
  'outline-light':
    'bg-transparent text-ivory border border-ivory/30 hover:border-ivory hover:bg-ivory hover:text-navy-950',
};

export function Button({ href, children, variant = 'primary', className, onClick }: ButtonProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'group inline-flex items-center gap-2 px-7 py-3.5 text-sm font-medium tracking-wide',
        'transition-all duration-300 ease-premium',
        variants[variant],
        className
      )}
    >
      {children}
    </Link>
  );
}
