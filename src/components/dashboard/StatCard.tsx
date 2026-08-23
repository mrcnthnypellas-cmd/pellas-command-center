import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Bold solid-color cards (icon, label, value, and sublabel all white) — deliberately
// outside the .card/.dashboard-shell theming system so these stay colorful and
// legible the same way regardless of the Dashboard Theme setting.
const ACCENT_CLASSES: Record<string, string> = {
  brand: 'bg-blue-600',
  green: 'bg-emerald-600',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  slate: 'bg-slate-700',
  teal: 'bg-cyan-500',
  purple: 'bg-violet-500',
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
    <div className={cn('relative overflow-hidden rounded-xl p-4 shadow-card', ACCENT_CLASSES[accent])}>
      <div className="pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full bg-white/10" />
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
        <Icon className="h-5 w-5" />
      </div>
      <div className="relative mt-3 min-w-0">
        <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-white/80">{label}</div>
        <div className="truncate text-2xl font-bold text-white">{value}</div>
        {sublabel && <div className="mt-0.5 truncate text-xs text-white/70">{sublabel}</div>}
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
