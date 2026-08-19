import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCENT_CLASSES: Record<string, string> = {
  brand: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
  teal: 'bg-teal-50 text-teal-600',
  purple: 'bg-violet-50 text-violet-600',
};

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = 'brand',
  sublabel,
  href,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: 'brand' | 'green' | 'amber' | 'red' | 'slate' | 'teal' | 'purple';
  sublabel?: string;
  href?: string;
}) {
  const content = (
    <div className="card flex items-start gap-3 p-4">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', ACCENT_CLASSES[accent])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-slate-500">{label}</div>
        <div className="truncate text-2xl font-semibold text-slate-900">{value}</div>
        {sublabel && <div className="truncate text-xs text-slate-400">{sublabel}</div>}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition-opacity hover:opacity-90">
        {content}
      </Link>
    );
  }
  return content;
}
