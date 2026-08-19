import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
}

// Date-only values (hire dates, pay periods, purchase dates, etc.) are stored as
// UTC-midnight timestamps and represent a calendar date, not a moment in time — they
// must display the same regardless of the viewer's timezone. Formatting in the
// viewer's local zone would shift them back a day for anyone west of UTC (this was a
// real bug: a Pacific-time server showed Aug 1 as "Jul 31").
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
}

// Fixed default rather than the server host's local timezone (Vercel/Windows/etc. can
// run anywhere) — Super Admin's configured platform timezone (Settings page) drives
// the live header clock; this default keeps timestamps sane wherever this renders.
export function formatDateTime(date: Date | string, timeZone = 'Asia/Manila'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(d);
}

export function roleLabel(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}
