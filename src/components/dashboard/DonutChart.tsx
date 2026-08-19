'use client';

export interface DonutSegment {
  label: string;
  value: number;
  color: string; // hex
}

export function DonutChart({
  segments,
  size = 160,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offset = 0;
  const arcs = segments.map((s) => {
    const fraction = s.value / total;
    const dash = fraction * circumference;
    const arc = {
      color: s.color,
      dasharray: `${dash} ${circumference - dash}`,
      dashoffset: -offset,
    };
    offset += dash;
    return arc;
  });

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={thickness} />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={arc.dasharray}
            strokeDashoffset={arc.dashoffset}
            strokeLinecap="butt"
          />
        ))}
        {centerValue != null && (
          <g transform={`rotate(90 ${center} ${center})`}>
            <text
              x={center}
              y={center - 4}
              textAnchor="middle"
              className="fill-slate-50"
              style={{ fontSize: size * 0.16, fontWeight: 700 }}
            >
              {centerValue}
            </text>
            {centerLabel && (
              <text
                x={center}
                y={center + 16}
                textAnchor="middle"
                className="fill-slate-400"
                style={{ fontSize: size * 0.08 }}
              >
                {centerLabel}
              </text>
            )}
          </g>
        )}
      </svg>

      <ul className="space-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-slate-600">{s.label}</span>
            <span className="font-medium text-slate-900">
              {s.value} ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
