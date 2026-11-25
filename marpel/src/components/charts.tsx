// Lightweight SVG charts tuned for the dark navy dashboard surface.
// Single-series charts use the brand gold; categorical charts use a palette
// validated for colour-vision deficiency against the #0b1528 card surface.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/utils';

export const SERIES = ['#338ced', '#e76624', '#00a888', '#d28e05', '#e24d8b', '#0aac23', '#9887ef', '#eb6263'];
export const GOLD = '#d8ae5a';
const GRID = 'rgba(255,255,255,0.06)';
const AXIS = 'rgba(255,255,255,0.16)';
const TICK = '#8b97ad';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e!.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * exp;
}

function Tooltip({ x, y, children, width }: { x: number; y: number; children: ReactNode; width: number }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-white/10 bg-navy-950/95 px-2.5 py-1.5 text-xs shadow-xl" style={{ left, top: y - 8 }}>
      {children}
    </div>
  );
}

export interface Datum {
  label: string;
  value: number;
}

/** Vertical bars, one series. */
export function BarChart({ data, height = 220, format = (v: number) => String(v), color = GOLD, ariaLabel }: { data: Datum[]; height?: number; format?: (v: number) => string; color?: string; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 8, t: 12, b: 26 };
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.min(34, Math.max(6, slot - 6));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => {
          const y = pad.t + ih - (t / max) * ih;
          return (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke={t === 0 ? AXIS : GRID} />
              <text x={pad.l - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill={TICK} className="tabular-nums">
                {format(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * ih;
          const x = pad.l + i * slot + (slot - bw) / 2;
          const y = pad.t + ih - h;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={d.label + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" />
              {h > 0 && <path d={`M${x},${pad.t + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${pad.t + ih} Z`} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />}
              <text x={x + bw / 2} y={height - 8} textAnchor="middle" fontSize="10" fill={hover === i ? '#fff' : TICK}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <Tooltip x={pad.l + hover * slot + slot / 2} y={pad.t + ih - (data[hover]!.value / max) * ih} width={width}>
          <div className="text-slate-400">{data[hover]!.label}</div>
          <div className="font-semibold tabular-nums text-white">{format(data[hover]!.value)}</div>
        </Tooltip>
      )}
    </div>
  );
}

/** Area + line with crosshair, one or two series of the same unit. */
export function LineChart({
  labels,
  series,
  height = 240,
  format = (v: number) => String(v),
  ariaLabel,
}: {
  labels: string[];
  series: { name: string; values: number[]; color: string; dashed?: boolean; area?: boolean }[];
  height?: number;
  format?: (v: number) => string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 52, r: 12, t: 12, b: 26 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (labels.length <= 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = e.clientX - rect.left - pad.l;
          const i = Math.round((px / iw) * (labels.length - 1));
          setHover(Math.max(0, Math.min(labels.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`area-${si}-${s.color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={TICK} className="tabular-nums">
              {format(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={l + i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="10" fill={hover === i ? '#fff' : TICK}>
            {l}
          </text>
        ))}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' L');
          return (
            <g key={s.name}>
              {s.area && <path d={`M${x(0)},${y(0)} L${pts} L${x(s.values.length - 1)},${y(0)} Z`} fill={`url(#area-${si}-${s.color.slice(1)})`} />}
              <path d={`M${pts}`} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="rgba(255,255,255,0.25)" />
            {series.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="4.5" fill={s.color} stroke="#0b1528" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <Tooltip x={x(hover)} y={y(Math.max(...series.map((s) => s.values[hover] ?? 0)))} width={width}>
          <div className="mb-0.5 text-slate-400">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-2 whitespace-nowrap">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="text-slate-300">{s.name}</span>
              <span className="ml-auto pl-3 font-semibold tabular-nums text-white">{format(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/** Horizontal ranked bars with direct value labels (single hue). */
export function HBarList({ data, format = (v: number) => String(v), color = GOLD, max: maxIn }: { data: (Datum & { sub?: string })[]; format?: (v: number) => string; color?: string; max?: number }) {
  const max = maxIn ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label} className="group" title={`${d.label}: ${format(d.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-slate-300">{d.label}</span>
            <span className="shrink-0 tabular-nums text-slate-400">
              <span className="font-semibold text-white">{format(d.value)}</span>
              {d.sub && <span className="ml-1.5">{d.sub}</span>}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/[0.05]">
            <div className="h-2 rounded-full transition-all duration-700 group-hover:brightness-125" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 100% segmented bar with legend + values (categorical, fixed slot order). */
export function SegmentBar({ data, format = (v: number) => String(v) }: { data: (Datum & { color: string })[]; format?: (v: number) => string }) {
  const total = data.reduce((n, d) => n + d.value, 0) || 1;
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-md">
        {data
          .filter((d) => d.value > 0)
          .map((d) => (
            <div
              key={d.label}
              title={`${d.label}: ${format(d.value)} (${Math.round((d.value / total) * 100)}%)`}
              onMouseEnter={() => setHover(d.label)}
              onMouseLeave={() => setHover(null)}
              className="h-full transition-opacity first:rounded-l-md last:rounded-r-md"
              style={{ width: `${(d.value / total) * 100}%`, background: d.color, opacity: hover && hover !== d.label ? 0.4 : 1 }}
            />
          ))}
      </div>
      <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-4 gap-y-2 text-xs">
        {data.map((d) => (
          <li key={d.label} onMouseEnter={() => setHover(d.label)} onMouseLeave={() => setHover(null)} className={cx('flex items-center gap-2 rounded px-1 py-0.5', hover === d.label && 'bg-white/5')}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="truncate text-slate-300">{d.label}</span>
            <span className="ml-auto tabular-nums text-white">{format(d.value)}</span>
            <span className="w-9 text-right tabular-nums text-slate-500">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Grouped vertical bars, 2–3 series of the same unit. */
export function GroupedBars({ labels, series, height = 240, format = (v: number) => String(v), ariaLabel }: { labels: string[]; series: { name: string; values: number[]; color: string }[]; height?: number; format?: (v: number) => string; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 52, r: 8, t: 12, b: 26 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const slot = iw / Math.max(1, labels.length);
  const gw = Math.min(56, slot - 8);
  const bw = Math.max(3, (gw - (series.length - 1) * 2) / series.length);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => {
          const y = pad.t + ih - (t / max) * ih;
          return (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke={t === 0 ? AXIS : GRID} />
              <text x={pad.l - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill={TICK} className="tabular-nums">
                {format(t)}
              </text>
            </g>
          );
        })}
        {labels.map((l, i) => {
          const gx = pad.l + i * slot + (slot - gw) / 2;
          return (
            <g key={l + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill={hover === i ? 'rgba(255,255,255,0.03)' : 'transparent'} />
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const h = (v / max) * ih;
                const x = gx + si * (bw + 2);
                const y = pad.t + ih - h;
                const r = Math.min(3, bw / 2, h);
                return h > 0 ? <path key={s.name} d={`M${x},${pad.t + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${pad.t + ih} Z`} fill={s.color} /> : null;
              })}
              <text x={pad.l + i * slot + slot / 2} y={height - 8} textAnchor="middle" fontSize="10" fill={hover === i ? '#fff' : TICK}>
                {l}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip x={pad.l + hover * slot + slot / 2} y={pad.t + ih - (Math.max(...series.map((s) => s.values[hover] ?? 0)) / max) * ih} width={width}>
          <div className="mb-0.5 text-slate-400">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-2 whitespace-nowrap">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
              <span className="text-slate-300">{s.name}</span>
              <span className="ml-auto pl-3 font-semibold tabular-nums text-white">{format(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cx('h-0.5 w-4 rounded', i.dashed && 'border-t-2 border-dashed bg-transparent')} style={i.dashed ? { borderColor: i.color } : { background: i.color, height: 8, width: 8, borderRadius: 2 }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Sparkline({ values, color = GOLD, width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * width},${height - 2 - (v / max) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
