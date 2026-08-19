'use client';

export interface MapPin {
  id: string;
  label: string;
  type: 'IN' | 'OUT' | 'OFFICE';
  lat: number;
  lng: number;
}

const TYPE_LABEL: Record<MapPin['type'], string> = { IN: 'Time In', OUT: 'Time Out', OFFICE: 'Office' };

/**
 * Real Google Maps embed — uses the keyless maps.google.com iframe embed (no
 * API key or billing account needed), so it shows actual streets/roads. That
 * keyless embed only supports centering on a single query point, so it plots
 * `pins[0]` (callers should order pins with the most relevant one first) and
 * links out to the full interactive map for anything beyond that one pin.
 */
export function StaticMap({ pins, height = 220 }: { pins: MapPin[]; height?: number }) {
  const primary = pins.find((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  if (!primary) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-400"
        style={{ height }}
      >
        No location data yet today
      </div>
    );
  }

  const embedSrc = `https://www.google.com/maps?q=${primary.lat},${primary.lng}&z=17&output=embed`;
  const openSrc = `https://www.google.com/maps?q=${primary.lat},${primary.lng}`;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" style={{ height }}>
      <iframe
        title={`Map — ${primary.label} (${TYPE_LABEL[primary.type]})`}
        src={embedSrc}
        className="absolute inset-0 h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-700 shadow">
        {primary.label} · {TYPE_LABEL[primary.type]}
      </div>
      <a
        href={openSrc}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-2 right-2 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-brand-700 shadow hover:bg-white"
      >
        Open in Google Maps
      </a>
    </div>
  );
}
