'use client';

export interface MapPin {
  id: string;
  label: string;
  type: 'IN' | 'OUT' | 'OFFICE';
  lat: number;
  lng: number;
}

/**
 * Illustrative map placeholder — no Google Maps/Mapbox API key configured, so this
 * renders a static grid-road backdrop and plots pins by normalizing real stored
 * lat/lng into the box. Swap for a real map component once a maps API key exists.
 */
export function StaticMap({ pins, height = 220 }: { pins: MapPin[]; height?: number }) {
  const withCoords = pins.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  const lats = withCoords.map((p) => p.lat);
  const lngs = withCoords.map((p) => p.lng);
  const minLat = lats.length ? Math.min(...lats) : 0;
  const maxLat = lats.length ? Math.max(...lats) : 1;
  const minLng = lngs.length ? Math.min(...lngs) : 0;
  const maxLng = lngs.length ? Math.max(...lngs) : 1;
  const latSpan = maxLat - minLat || 1;
  const lngSpan = maxLng - minLng || 1;

  const positioned = withCoords.map((p) => ({
    ...p,
    xPct: 10 + ((p.lng - minLng) / lngSpan) * 80,
    yPct: 10 + (1 - (p.lat - minLat) / latSpan) * 80,
  }));

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
      style={{ height }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <pattern id="mapGrid" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#e2e8f0" strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#mapGrid)" />
        <path d="M 0 60 Q 25 40 50 55 T 100 45" fill="none" stroke="#cbd5e1" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        <path d="M 20 0 Q 35 30 30 100" fill="none" stroke="#cbd5e1" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>

      {positioned.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          No location data yet today
        </div>
      ) : (
        positioned.map((p) => (
          <div
            key={p.id}
            className="group absolute -translate-x-1/2 -translate-y-full"
            style={{ left: `${p.xPct}%`, top: `${p.yPct}%`, zIndex: p.type === 'OFFICE' ? 5 : 10 }}
          >
            <div
              className={`flex items-center justify-center border-2 border-white shadow-md ${
                p.type === 'OFFICE'
                  ? 'h-7 w-7 rounded-md bg-brand-600'
                  : `h-6 w-6 rounded-full ${p.type === 'IN' ? 'bg-emerald-500' : 'bg-red-500'}`
              }`}
            >
              {p.type === 'OFFICE' ? (
                <div className="h-2.5 w-2.5 rounded-sm bg-white" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-white" />
              )}
            </div>
            <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white group-hover:block">
              {p.label} · {p.type === 'IN' ? 'Time In' : p.type === 'OUT' ? 'Time Out' : 'Office'}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
