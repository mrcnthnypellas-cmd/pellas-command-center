// Prototype data layer. Holds the whole database in React state, persists it to
// localStorage and syncs across browser tabs (so the public site in one tab and
// the admin dashboard in another behave like a live system).
//
// PRODUCTION: replace `update()` with Supabase queries/mutations + Realtime
// subscriptions. Components only use `useDB()` and the action helpers, so the
// swap is localised to this module and lib/actions.ts.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DB, User } from './types';
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
  };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as DB;
      if (db.version === VERSION) {
        // Carry updated official contact numbers into browsers that still hold the old placeholders.
        if (db.settings.phone === '(02) 8123 4567') db.settings.phone = seedSettings.phone;
        if (db.settings.mobile === '+63 917 000 0000') db.settings.mobile = seedSettings.mobile;
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
}

const StoreCtx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(load);
  // Mutations apply synchronously against the latest snapshot so callers can
  // read back generated values (reference numbers, ids) right after update().
  const latest = useRef(db);
  const [storageWarning, setWarning] = useState<string | null>(null);
  const skipPersist = useRef(false);

  useEffect(() => {
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

  // Cross-tab sync: another tab wrote the DB → adopt it without re-writing.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        const next = JSON.parse(e.newValue) as DB;
        skipPersist.current = true;
        latest.current = next;
        setDb(next);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((recipe: (draft: DB) => void) => {
    const draft = structuredClone(latest.current);
    recipe(draft);
    latest.current = draft;
    setDb(draft);
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    const fresh = buildSeed();
    latest.current = fresh;
    setDb(fresh);
  }, []);

  const value = useMemo(() => ({ db, update, reset, storageWarning }), [db, update, reset, storageWarning]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore outside provider');
  return v;
}
export const useDB = () => useStore().db;

// ── Admin session (prototype auth) ──────────────────────────────────────────

const SESSION_KEY = 'marpel.session';
const SESSION_HOURS = 8;

interface SessionValue {
  user: User | null;
  login: (username: string, password: string) => string | null;
  logout: () => void;
  expiresAt: number | null;
}

const SessionCtx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
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

  return <SessionCtx.Provider value={{ user, login, logout, expiresAt: sess?.expiresAt ?? null }}>{children}</SessionCtx.Provider>;
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
