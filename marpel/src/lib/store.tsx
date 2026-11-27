// Data layer. Holds the database in React state; components only use useDB()
// and update(recipe).
//  - LIVE (Supabase configured): content comes from the `site` table, business
//    records load after a staff sign-in, every update() is diffed and saved,
//    and changes from other devices arrive through Supabase Realtime.
//  - Prototype (no Supabase env): sample data persisted to localStorage and
//    synced across tabs, used for local review and automated tests.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DB, User } from './types';
import { applyRecord, applySite, diff, isEmpty, loadProfiles, loadRecords, loadSite, myProfile, persist, SITE_KEYS, siteValue, type SiteKey } from './live';
import { LIVE, sb } from './supabase';
import {
  seedAI,
  seedAvailability,
  seedContent,
  seedPortfolio,
  seedPosts,
  seedServices,
  seedSettings,
  seedStageTemplates,
  seedTestimonials,
} from './seed-content';
import { seedRecords } from './seed-records';

const KEY = 'marpel.prototype.db';
const VERSION = 3;

export function buildSeed(): DB {
  const r = structuredClone(seedRecords);
  return {
    version: VERSION,
    settings: structuredClone(seedSettings),
    content: structuredClone(seedContent),
    testimonials: structuredClone(seedTestimonials),
    services: structuredClone(seedServices),
    portfolio: structuredClone(seedPortfolio),
    posts: structuredClone(seedPosts),
    users: r.users,
    customers: r.customers,
    inquiries: r.inquiries,
    conversations: r.conversations,
    quotations: r.quotations,
    projects: r.projects,
    stageTemplates: structuredClone(seedStageTemplates),
    appointments: r.appointments,
    availability: structuredClone(seedAvailability),
    ai: { ...structuredClone(seedAI), conversations: r.aiConversations },
    notifications: r.notifications,
    emails: r.emails,
    audit: r.audit,
    counters: r.counters,
    migrations: ['real-portfolio-1', 'owner-details-1', 'motto-1'],
  };
}

/** Production starting point: real website content, no sample business records. */
export function buildLiveSeed(): DB {
  const db = buildSeed();
  db.users = [];
  db.customers = [];
  db.inquiries = [];
  db.conversations = [];
  db.quotations = [];
  db.projects = [];
  db.appointments = [];
  db.notifications = [];
  db.emails = [];
  db.audit = [];
  db.ai.conversations = [];
  db.counters = { inquiry: 0, quotation: 0, project: 0, appointment: 0 };
  return db;
}

/** One-time updates for data already stored in a browser. */
function migrate(db: DB) {
  const done = new Set(db.migrations ?? []);
  if (!done.has('real-portfolio-1')) {
    // Replace the original fictional sample projects with Marpel's real work; keep anything the owner added.
    const oldSeed = /^pf\d+$/;
    db.portfolio = [...structuredClone(seedPortfolio), ...db.portfolio.filter((p) => !oldSeed.test(p.id))];
    const fictional = new Set(['t1', 't2', 't3', 't4', 't5', 't6']);
    db.testimonials.forEach((t) => fictional.has(t.id) && (t.status = 'archived'));
    const post = db.posts.find((p) => p.id === 'b6');
    if (post?.status === 'published') post.status = 'draft';
    done.add('real-portfolio-1');
  }
  if (!done.has('owner-details-1')) {
    // Owner instructions (Nov 2026): no figures on the homepage, prices on inquiry only, official email and office.
    if (db.content.stats.every((x) => /^s\d$/.test(x.id))) db.content.stats = [];
    if (db.content.about.founded === '2019') db.content.about.founded = '';
    db.services.forEach((x) => (x.showPrice = false));
    db.ai.showStartingPrices = false;
    const st = db.settings;
    if (st.email === 'hello@marpeltech.example') st.email = seedSettings.email;
    if (st.supportEmail === 'support@marpeltech.example') st.supportEmail = seedSettings.supportEmail;
    if (st.adminNotificationEmail === 'owner@marpeltech.example') st.adminNotificationEmail = seedSettings.adminNotificationEmail;
    if (st.address.startsWith('Unit 0, Sample')) {
      st.address = seedSettings.address;
      st.city = seedSettings.city;
      st.mapQuery = seedSettings.mapQuery;
    }
    done.add('owner-details-1');
  }
  if (!done.has('motto-1')) {
    if (db.content.motto === undefined) db.content.motto = seedContent.motto;
    done.add('motto-1');
  }
  db.migrations = [...done];
}

function load(): DB {
  if (LIVE) return buildLiveSeed();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as DB;
      if (db.version === VERSION) {
        // Carry updated official contact numbers into browsers that still hold the old placeholders.
        if (db.settings.phone === '(02) 8123 4567') db.settings.phone = seedSettings.phone;
        if (db.settings.mobile === '+63 917 000 0000') db.settings.mobile = seedSettings.mobile;
        migrate(db);
        return db;
      }
    }
  } catch {
    /* fall through to seed */
  }
  return buildSeed();
}

interface StoreValue {
  db: DB;
  update: (recipe: (draft: DB) => void) => void;
  reset: () => void;
  storageWarning: string | null;
  /** LIVE only: save status of the last change. */
  sync: { saving: boolean; error: string | null };
  /** LIVE only: load business records for a signed-in staff member. */
  attachStaff: (u: User) => Promise<void>;
  detachStaff: () => void;
  reloadProfiles: () => Promise<void>;
}

const StoreCtx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(load);
  // Mutations apply synchronously against the latest snapshot so callers can
  // read back generated values (reference numbers, ids) right after update().
  const latest = useRef(db);
  const [storageWarning, setWarning] = useState<string | null>(null);
  const skipPersist = useRef(false);
  const [sync, setSync] = useState<{ saving: boolean; error: string | null }>({ saving: false, error: null });
  const canPersist = useRef(false);
  const missingSite = useRef<SiteKey[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const channel = useRef<ReturnType<ReturnType<typeof sb>['channel']> | null>(null);

  const replace = useCallback((next: DB) => {
    latest.current = next;
    setDb(next);
  }, []);

  // Prototype: persist to localStorage.
  useEffect(() => {
    if (LIVE) return;
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      setWarning(null);
    } catch {
      setWarning('Browser storage is full — remove some uploaded images. (Production uses cloud storage, so this limit is prototype-only.)');
    }
  }, [db]);

  // Prototype: cross-tab sync — another tab wrote the DB → adopt it without re-writing.
  useEffect(() => {
    if (LIVE) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        const next = JSON.parse(e.newValue) as DB;
        skipPersist.current = true;
        replace(next);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [replace]);

  // LIVE: website content for everyone, with realtime updates when the owner edits it.
  useEffect(() => {
    if (!LIVE) return;
    loadSite()
      .then((rows) => {
        const d = structuredClone(latest.current);
        const missing: SiteKey[] = [];
        for (const k of SITE_KEYS) {
          if (k in rows) applySite(d, k, rows[k]);
          else missing.push(k);
        }
        missingSite.current = missing;
        replace(d);
      })
      .catch(() => {
        /* keep bundled content if the backend is unreachable */
      });
    const ch = sb()
      .channel('site-content')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site' }, (payload) => {
        const row = payload.new as { key?: SiteKey; data?: unknown };
        if (!row?.key) return;
        if (JSON.stringify(siteValue(latest.current, row.key)) === JSON.stringify(row.data)) return;
        const d = structuredClone(latest.current);
        applySite(d, row.key, row.data);
        replace(d);
      })
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [replace]);

  const applyServerRows = useCallback(
    (rows: { collection: string; id: string; data: unknown }[]) => {
      if (!rows.length) return;
      const d = structuredClone(latest.current);
      let changed = false;
      for (const r of rows) {
        const before = JSON.stringify(findRecord(d, r.collection, r.id));
        if (before !== JSON.stringify(r.data)) {
          applyRecord(d, r.collection, r.id, r.data);
          changed = true;
        }
      }
      if (changed) replace(d);
    },
    [replace],
  );

  const save = useCallback(
    (prev: DB, next: DB) => {
      const d = diff(prev, next);
      if (isEmpty(d)) return;
      queue.current = queue.current.then(async () => {
        setSync({ saving: true, error: null });
        try {
          applyServerRows(await persist(d));
          setSync({ saving: false, error: null });
        } catch (e) {
          setSync({ saving: false, error: (e as { message?: string })?.message ?? 'Could not save changes.' });
        }
      });
    },
    [applyServerRows],
  );

  const update = useCallback(
    (recipe: (draft: DB) => void) => {
      const prev = latest.current;
      const draft = structuredClone(prev);
      recipe(draft);
      replace(draft);
      if (LIVE && canPersist.current) save(prev, draft);
    },
    [replace, save],
  );

  const attachStaff = useCallback(
    async (u: User) => {
      if (!LIVE) return;
      canPersist.current = u.active;
      const d = structuredClone(latest.current);
      await loadRecords(d);
      d.users = await loadProfiles().catch(() => [u]);
      for (const k of ['inquiry', 'quotation', 'project', 'appointment'] as const) {
        const list = { inquiry: d.inquiries, quotation: d.quotations, project: d.projects, appointment: d.appointments }[k] as unknown[];
        d.counters[k] = list.length;
      }
      replace(d);
      // First owner sign-in: publish the bundled website content to the database.
      if ((u.role === 'super_admin' || u.role === 'admin') && missingSite.current.length) {
        const keys = missingSite.current;
        missingSite.current = [];
        persist({ site: keys.map((k) => ({ key: k, data: siteValue(latest.current, k) })), upserts: [], deletes: [], profiles: [] }).catch(() => {
          missingSite.current = keys;
        });
      }
      if (channel.current) sb().removeChannel(channel.current);
      channel.current = sb()
        .channel('records-' + u.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const o = payload.old as { collection?: string; id?: string };
            if (!o?.collection || !o.id) return;
            const d2 = structuredClone(latest.current);
            applyRecord(d2, o.collection, o.id, null);
            replace(d2);
          } else {
            const n = payload.new as { collection: string; id: string; data: unknown };
            applyServerRows([n]);
          }
        })
        .subscribe();
    },
    [applyServerRows, replace],
  );

  const detachStaff = useCallback(() => {
    if (!LIVE) return;
    canPersist.current = false;
    if (channel.current) {
      sb().removeChannel(channel.current);
      channel.current = null;
    }
    const d = structuredClone(latest.current);
    const empty = buildLiveSeed();
    for (const k of ['users', 'customers', 'inquiries', 'conversations', 'quotations', 'projects', 'appointments', 'notifications', 'emails', 'audit'] as const) {
      (d as unknown as Record<string, unknown>)[k] = (empty as unknown as Record<string, unknown>)[k];
    }
    d.ai.conversations = [];
    replace(d);
  }, [replace]);

  const reloadProfiles = useCallback(async () => {
    if (!LIVE) return;
    const users = await loadProfiles();
    const d = structuredClone(latest.current);
    d.users = users;
    replace(d);
  }, [replace]);

  const reset = useCallback(() => {
    if (LIVE) return;
    localStorage.removeItem(KEY);
    replace(buildSeed());
  }, [replace]);

  const value = useMemo(
    () => ({ db, update, reset, storageWarning, sync, attachStaff, detachStaff, reloadProfiles }),
    [db, update, reset, storageWarning, sync, attachStaff, detachStaff, reloadProfiles],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

function findRecord(db: DB, collection: string, id: string): unknown {
  const map: Record<string, { id: string }[]> = {
    customers: db.customers,
    inquiries: db.inquiries,
    conversations: db.conversations,
    quotations: db.quotations,
    projects: db.projects,
    appointments: db.appointments,
    notifications: db.notifications,
    emails: db.emails,
    audit: db.audit,
    ai_conversations: db.ai.conversations,
  };
  return map[collection]?.find((x) => x.id === id);
}

export function useStore() {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore outside provider');
  return v;
}
export const useDB = () => useStore().db;

// ── Staff session ───────────────────────────────────────────────────────────

interface SessionValue {
  user: User | null;
  /** Prototype returns the error synchronously; LIVE returns a promise. */
  login: (username: string, password: string) => string | null | Promise<string | null>;
  logout: () => void;
  expiresAt: number | null;
  /** false until the saved sign-in (if any) has been checked. */
  ready: boolean;
}

const SessionCtx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  return LIVE ? <LiveSession>{children}</LiveSession> : <PrototypeSession>{children}</PrototypeSession>;
}

/** Production sign-in with Supabase Auth (email + password). */
function LiveSession({ children }: { children: ReactNode }) {
  const { db, attachStaff, detachStaff, update } = useStore();
  const [me, setMe] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const attached = useRef<string | null>(null);

  useEffect(() => {
    const client = sb();
    let cancelled = false;
    const onSession = async (session: { expires_at?: number } | null) => {
      if (!session) {
        attached.current = null;
        setMe(null);
        setExpiresAt(null);
        detachStaff();
        return;
      }
      setExpiresAt(session.expires_at ? session.expires_at * 1000 : null);
      const prof = await myProfile();
      if (cancelled) return;
      if (!prof || !prof.active) {
        setMe(null);
        detachStaff();
        return;
      }
      setMe(prof);
      if (attached.current !== prof.id) {
        attached.current = prof.id;
        await attachStaff(prof);
      }
    };
    client.auth.getSession().then(({ data }) => onSession(data.session).finally(() => !cancelled && setReady(true)));
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(() => onSession(session), 0);
      if (event === 'TOKEN_REFRESHED' && session?.expires_at) setExpiresAt(session.expires_at * 1000);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [attachStaff, detachStaff]);

  // Keep role/name changes made by the owner in sync with the signed-in user.
  const user = me ? db.users.find((u) => u.id === me.id) ?? me : null;

  const login = useCallback(
    async (email: string, password: string) => {
      const client = sb();
      const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) return error.message.includes('Email not confirmed') ? 'Please confirm your email address first.' : 'Invalid email or password.';
      const prof = await myProfile();
      if (!prof?.active) {
        await client.auth.signOut();
        return 'This account is not active. Ask the Super Administrator to activate it.';
      }
      await client.rpc('touch_login');
      setTimeout(
        () =>
          update((d) => {
            d.audit.unshift({ id: 'au_' + crypto.randomUUID().replace(/-/g, '').slice(0, 18), at: new Date().toISOString(), user: prof.name, role: prof.role, action: 'Signed in', target: 'Admin dashboard' });
          }),
        1500,
      );
      return null;
    },
    [update],
  );

  const logout = useCallback(() => {
    sb().auth.signOut();
  }, []);

  return <SessionCtx.Provider value={{ user: user && user.active ? user : null, login, logout, expiresAt, ready }}>{children}</SessionCtx.Provider>;
}

const SESSION_KEY = 'marpel.session';
const SESSION_HOURS = 8;

/** Prototype sign-in against the demo accounts stored in the browser. */
function PrototypeSession({ children }: { children: ReactNode }) {
  const { db, update } = useStore();
  const [sess, setSess] = useState<{ userId: string; expiresAt: number } | null>(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (s && s.expiresAt > Date.now()) return s;
    } catch {
      /* ignore */
    }
    return null;
  });
  const failures = useRef<{ count: number; until: number }>({ count: 0, until: 0 });

  const user = sess ? db.users.find((u) => u.id === sess.userId && u.active) ?? null : null;

  useEffect(() => {
    if (!sess) return;
    const t = setTimeout(() => {
      sessionStorage.removeItem(SESSION_KEY);
      setSess(null);
    }, Math.max(0, sess.expiresAt - Date.now()));
    return () => clearTimeout(t);
  }, [sess]);

  const login = useCallback(
    (username: string, password: string) => {
      if (Date.now() < failures.current.until) {
        return `Too many attempts. Try again in ${Math.ceil((failures.current.until - Date.now()) / 1000)}s.`;
      }
      const u = db.users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase() || x.email.toLowerCase() === username.trim().toLowerCase());
      if (!u || u.password !== password) {
        failures.current.count++;
        if (failures.current.count >= 5) {
          failures.current = { count: 0, until: Date.now() + 30_000 };
        }
        return 'Invalid username or password.';
      }
      if (!u.active) return 'This account is deactivated. Contact the Super Administrator.';
      failures.current = { count: 0, until: 0 };
      const s = { userId: u.id, expiresAt: Date.now() + SESSION_HOURS * 3600_000 };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      setSess(s);
      update((d) => {
        const x = d.users.find((y) => y.id === u.id);
        if (x) x.lastLoginAt = new Date().toISOString();
        d.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), user: u.name, role: u.role, action: 'Signed in', target: 'Admin dashboard' });
      });
      return null;
    },
    [db.users, update],
  );

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setSess(null);
  }, []);

  return <SessionCtx.Provider value={{ user, login, logout, expiresAt: sess?.expiresAt ?? null, ready: true }}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const v = useContext(SessionCtx);
  if (!v) throw new Error('useSession outside provider');
  return v;
}

// ── Toasts ──────────────────────────────────────────────────────────────────

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: 'success' | 'info' | 'warning' | 'error';
}
const ToastCtx = createContext<{ toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );
  return <ToastCtx.Provider value={{ toasts, push, dismiss }}>{children}</ToastCtx.Provider>;
}
export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast outside provider');
  return v;
}
