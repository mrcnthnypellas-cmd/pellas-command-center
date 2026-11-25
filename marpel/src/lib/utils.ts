import type { Attachment, Quotation } from './types';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function uid(prefix = '') {
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${r}`;
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len: number) {
  let s = '';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += ALPHA[buf[i] % ALPHA.length];
  return s;
}

export function pad(n: number, w = 4) {
  return String(n).padStart(w, '0');
}

export const nowISO = () => new Date().toISOString();

export function todayYMD(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function parseYMD(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function money(n: number | null | undefined, symbol = '₱', decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${symbol}${n.toLocaleString('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function compactMoney(n: number, symbol = '₱') {
  if (Math.abs(n) >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `${symbol}${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return `${symbol}${n.toFixed(0)}`;
}

export function fmtDate(iso?: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return '—';
  const d = iso.length === 10 ? parseYMD(iso) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', opts);
}

export function fmtDateTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(iso);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── Validation ──────────────────────────────────────────────────────────────

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
export const isPhone = (s: string) => /^[+()\d\s-]{7,20}$/.test(s.trim()) && s.replace(/\D/g, '').length >= 7;

/** Strip control characters and cap length — mirrors server-side sanitisation planned for production. */
export function clean(s: string, max = 5000) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max).trim();
}

// ── Files ───────────────────────────────────────────────────────────────────

export const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Downscale an image and return a JPEG data URL so prototype storage stays small. */
export function imageToDataUrl(file: File, maxW = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unreadable image'));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export async function filesToAttachments(files: FileList | File[]): Promise<{ ok: Attachment[]; rejected: string[] }> {
  const ok: Attachment[] = [];
  const rejected: string[] = [];
  for (const f of Array.from(files)) {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(f.type)) {
      rejected.push(`${f.name}: file type not allowed`);
      continue;
    }
    if (f.size > MAX_ATTACHMENT_BYTES) {
      rejected.push(`${f.name}: larger than 10 MB`);
      continue;
    }
    const a: Attachment = { id: uid('f_'), name: f.name, size: f.size, type: f.type };
    if (f.type.startsWith('image/')) {
      try {
        a.dataUrl = await imageToDataUrl(f, 900, 0.75);
      } catch {
        /* keep metadata only */
      }
    }
    ok.push(a);
  }
  return { ok, rejected };
}

// ── Exports ─────────────────────────────────────────────────────────────────

export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? '' : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Quotation math ──────────────────────────────────────────────────────────

export function quoteTotals(q: Pick<Quotation, 'items' | 'discount' | 'discountType' | 'taxRate'>) {
  const byKind: Record<string, number> = { Service: 0, Labor: 0, Materials: 0, Equipment: 0 };
  let subtotal = 0;
  for (const it of q.items) {
    const line = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
    byKind[it.kind] = (byKind[it.kind] || 0) + line;
    subtotal += line;
  }
  const discount = q.discountType === 'percent' ? (subtotal * (Number(q.discount) || 0)) / 100 : Number(q.discount) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = (taxable * (Number(q.taxRate) || 0)) / 100;
  const total = taxable + tax;
  return { byKind, subtotal, discount, taxable, tax, total };
}

/** Deterministic PRNG for reproducible sample data. */
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}`;
}

export function lastNMonths(n: number, ref = new Date()) {
  const out: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const end = new Date(ref.getFullYear(), ref.getMonth() - i + 1, 1);
    out.push({
      key: `${start.getFullYear()}-${pad(start.getMonth() + 1, 2)}`,
      label: start.toLocaleDateString('en-US', { month: 'short' }),
      start,
      end,
    });
  }
  return out;
}
