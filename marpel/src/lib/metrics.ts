import type { DB, Inquiry, Project } from './types';
import { lastNMonths, monthKey, quoteTotals } from './utils';

export const WON: Inquiry['status'][] = ['Approved', 'In Progress', 'Completed'];
export const ACTIVE_PROJECT: Project['status'][] = ['Planning', 'Approved', 'In Progress', 'On Hold'];

export function inRange(iso: string, from?: Date, to?: Date) {
  const t = new Date(iso).getTime();
  return (!from || t >= from.getTime()) && (!to || t < to.getTime());
}

export function monthlyCounts<T>(rows: T[], dateOf: (r: T) => string | undefined, months = 12) {
  const ms = lastNMonths(months);
  const m = new Map(ms.map((x) => [x.key, 0]));
  for (const r of rows) {
    const d = dateOf(r);
    if (!d) continue;
    const k = monthKey(d);
    if (m.has(k)) m.set(k, m.get(k)! + 1);
  }
  return ms.map((x) => ({ label: x.label, key: x.key, value: m.get(x.key)! }));
}

export function monthlySum<T>(rows: T[], dateOf: (r: T) => string | undefined, valueOf: (r: T) => number, months = 12) {
  const ms = lastNMonths(months);
  const m = new Map(ms.map((x) => [x.key, 0]));
  for (const r of rows) {
    const d = dateOf(r);
    if (!d) continue;
    const k = monthKey(d.length === 10 ? `${d}T12:00:00` : d);
    if (m.has(k)) m.set(k, m.get(k)! + valueOf(r));
  }
  return ms.map((x) => ({ label: x.label, key: x.key, value: Math.round(m.get(x.key)!) }));
}

/** Recorded revenue = money recorded on projects (not quotation estimates). Attributed to completion month, or start month for in-flight deposits. */
export const revenueDate = (p: Project) => p.completedDate ?? p.startDate;

export function conversionRate(inquiries: Inquiry[]) {
  const decided = inquiries.filter((i) => i.status !== 'New');
  if (!inquiries.length) return 0;
  return Math.round((inquiries.filter((i) => WON.includes(i.status)).length / inquiries.length) * 1000) / 10 || (decided.length ? 0 : 0);
}

export function serviceDemand(db: DB, inquiries = db.inquiries) {
  const names = db.services.map((s) => s.name);
  const m = new Map<string, number>(names.map((n) => [n, 0]));
  for (const i of inquiries) m.set(i.service, (m.get(i.service) ?? 0) + 1);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function quotationPipeline(db: DB) {
  const sum = (st: string[]) => db.quotations.filter((q) => st.includes(q.status)).reduce((n, q) => n + quoteTotals(q).total, 0);
  return { open: sum(['Sent', 'Viewed']), draft: sum(['Draft']), approved: sum(['Approved']), rejected: sum(['Rejected', 'Expired']) };
}
