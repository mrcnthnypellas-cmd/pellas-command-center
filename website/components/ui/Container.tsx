import { cn } from '@/lib/utils';

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('mx-auto w-full max-w-8xl container-px', className)}>{children}</div>;
}
