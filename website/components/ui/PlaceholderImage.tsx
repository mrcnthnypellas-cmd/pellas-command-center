import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Stand-in for real photography. Renders a tasteful navy/gold panel with the
 * intended filename so it's obvious what to replace and where.
 *
 * To swap in a real photo:
 *   1. Add the image to /public/images (e.g. public/images/office.jpg)
 *   2. Replace <PlaceholderImage file="office.jpg" ... /> with
 *      <Image src="/images/office.jpg" alt="..." fill className="object-cover" />
 */
export function PlaceholderImage({
  file,
  label,
  className,
}: {
  file: string;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-navy-900',
        className
      )}
      role="img"
      aria-label={label ?? `Placeholder for ${file}`}
    >
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(250,249,246,1) 1px, transparent 1px), linear-gradient(90deg, rgba(250,249,246,1) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-black" />
      <div className="relative flex flex-col items-center gap-3 px-6 text-center">
        <ImageIcon size={28} strokeWidth={1.25} className="text-gold-400/70" />
        <p className="text-xs font-medium uppercase tracking-widest2 text-ivory/50">
          {label ?? 'Image placeholder'}
        </p>
        <p className="font-mono text-[11px] text-ivory/30">public/images/{file}</p>
      </div>
    </div>
  );
}
