// Production data layer (Supabase).
//
// Website content lives in table `site` (one JSON row per key, public read,
// admin write). Business records live in table `records` (collection + id +
// JSON data) guarded by row-level security: staff only see what their role
// allows. Visitors never touch tables directly; they call the secure
// functions submit_inquiry, book_appointment, start_conversation, etc.

import type { AIConversation, DB, User } from './types';
import { sb } from './supabase';

export const SITE_KEYS = ['settings', 'content', 'services', 'portfolio', 'posts', 'testimonials', 'availability', 'ai', 'stageTemplates'] as const;
export type SiteKey = (typeof SITE_KEYS)[number];

export const COLLECTIONS = {
  customers: 'customers',
  inquiries: 'inquiries',
  conversations: 'conversations',
  quotations: 'quotations',
  projects: 'projects',
  appointments: 'appointments',
  notifications: 'notifications',
  emails: 'emails',
  audit: 'audit',
} as const;
type DBArrayKey = keyof typeof COLLECTIONS;
export const AI_COLLECTION = 'ai_conversations';

// ── Reading ─────────────────────────────────────────────────────────────────

export function siteValue(db: DB, k: SiteKey): unknown {
  if (k === 'ai') {
    const { conversations: _c, ...rest } = db.ai;
    void _c;
    return rest;
  }
  return (db as unknown as Record<string, unknown>)[k];
}

export function applySite(db: DB, k: SiteKey, data: unknown) {
  if (k === 'ai') db.ai = { ...(data as DB['ai']), conversations: db.ai.conversations };
  else (db as unknown as Record<string, unknown>)[k] = data;
}

export async function loadSite(): Promise<Partial<Record<SiteKey, unknown>>> {
  const { data, error } = await sb().from('site').select('key,data');
  if (error) throw error;
  const out: Partial<Record<SiteKey, unknown>> = {};
  for (const r of data ?? []) out[r.key as SiteKey] = r.data;
  return out;
}

async function loadCollection(collection: string): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb().from('records').select('data').eq('collection', collection).order('created_at', { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []).map((r) => r.data));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Loads every business record the signed-in user is allowed to see. */
export async function loadRecords(db: DB) {
  const names = Object.keys(COLLECTIONS) as DBArrayKey[];
  const results = await Promise.all([...names.map((n) => loadCollection(COLLECTIONS[n])), loadCollection(AI_COLLECTION)]);
  names.forEach((n, i) => {
    (db as unknown as Record<string, unknown[]>)[n] = results[i]!;
  });
  db.notifications.sort((a, b) => b.at.localeCompare(a.at));
  db.emails.sort((a, b) => b.at.localeCompare(a.at));
  db.audit.sort((a, b) => b.at.localeCompare(a.at));
  db.ai.conversations = (results[names.length] as AIConversation[]).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

interface ProfileRow {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  role: User['role'];
  title: string;
  phone: string;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}
export const profileToUser = (p: ProfileRow): User => ({
  id: p.id,
  name: p.name,
  username: p.username ?? '',
  email: p.email ?? '',
  password: '',
  role: p.role,
  title: p.title,
  phone: p.phone,
  active: p.active,
  createdAt: p.created_at,
  lastLoginAt: p.last_login_at ?? undefined,
});

export async function loadProfiles(): Promise<User[]> {
  const { data, error } = await sb().from('profiles').select('*').order('created_at');
  if (error) throw error;
  return (data as ProfileRow[]).map(profileToUser);
}

export async function myProfile(): Promise<User | null> {
  const { data, error } = await sb().rpc('my_profile');
  if (error || !data) return null;
  return profileToUser(data as ProfileRow);
}

// ── Writing: diff the previous and next state, save only what changed ───────

type Row = { collection: string; id: string; data: unknown };

function byId(list: { id: string }[]) {
  const m = new Map<string, string>();
  for (const x of list) m.set(x.id, JSON.stringify(x));
  return m;
}

export interface Diff {
  site: { key: SiteKey; data: unknown }[];
  upserts: Row[];
  deletes: { collection: string; id: string }[];
  profiles: User[];
}

export function diff(prev: DB, next: DB): Diff {
  const d: Diff = { site: [], upserts: [], deletes: [], profiles: [] };
  for (const k of SITE_KEYS) {
    const a = siteValue(prev, k);
    const b = siteValue(next, k);
    if (a !== b && JSON.stringify(a) !== JSON.stringify(b)) d.site.push({ key: k, data: b });
  }
  const lists: [string, { id: string }[], { id: string }[]][] = (Object.keys(COLLECTIONS) as DBArrayKey[]).map((n) => [COLLECTIONS[n], prev[n] as { id: string }[], next[n] as { id: string }[]]);
  lists.push([AI_COLLECTION, prev.ai.conversations, next.ai.conversations]);
  for (const [collection, a, b] of lists) {
    if (a === b) continue;
    const before = byId(a);
    const after = byId(b);
    for (const x of b) if (before.get(x.id) !== after.get(x.id)) d.upserts.push({ collection, id: x.id, data: x });
    for (const id of before.keys()) if (!after.has(id)) d.deletes.push({ collection, id });
  }
  if (prev.users !== next.users) {
    const before = byId(prev.users);
    for (const u of next.users) if (before.get(u.id) !== JSON.stringify(u) && before.has(u.id)) d.profiles.push(u);
  }
  return d;
}

export const isEmpty = (d: Diff) => !d.site.length && !d.upserts.length && !d.deletes.length && !d.profiles.length;

/** Saves a diff. Returns server copies of upserted records (official numbers are assigned by the database). */
export async function persist(d: Diff): Promise<Row[]> {
  const client = sb();
  const saved: Row[] = [];
  if (d.site.length) {
    const { error } = await client.from('site').upsert(d.site.map((s) => ({ key: s.key, data: s.data, updated_at: new Date().toISOString() })));
    if (error) throw error;
  }
  for (let i = 0; i < d.upserts.length; i += 200) {
    const chunk = d.upserts.slice(i, i + 200);
    const { data, error } = await client.from('records').upsert(chunk).select('collection,id,data');
    if (error) throw error;
    saved.push(...((data ?? []) as Row[]));
  }
  for (const x of d.deletes) {
    const { error } = await client.from('records').delete().eq('collection', x.collection).eq('id', x.id);
    if (error) throw error;
  }
  for (const u of d.profiles) {
    const { error } = await client.from('profiles').update({ name: u.name, username: u.username || null, role: u.role, title: u.title, phone: u.phone, active: u.active }).eq('id', u.id);
    if (error) throw error;
  }
  return saved;
}

/** Writes a server copy of a record into a DB draft (used for saves and realtime events). */
export function applyRecord(db: DB, collection: string, id: string, data: unknown | null) {
  const list: { id: string }[] =
    collection === AI_COLLECTION ? db.ai.conversations : ((db as unknown as Record<string, { id: string }[]>)[(Object.keys(COLLECTIONS) as DBArrayKey[]).find((k) => COLLECTIONS[k] === collection) ?? ''] ?? []);
  const i = list.findIndex((x) => x.id === id);
  if (data === null) {
    if (i >= 0) list.splice(i, 1);
    return;
  }
  if (i >= 0) list[i] = data as { id: string };
  else if (['notifications', 'emails', 'audit', AI_COLLECTION].includes(collection)) list.unshift(data as { id: string });
  else list.push(data as { id: string });
}
