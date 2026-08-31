import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, usernameToEmail } from "./supabase";
import type { Profile } from "../types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function logAudit(action: string, module: string, target?: string, details?: unknown, companyId?: string, actorId?: string, actorName?: string) {
  if (!companyId || !actorId) return;
  await supabase.from("audit_logs").insert({
    company_id: companyId,
    actor_id: actorId,
    actor_name: actorName ?? null,
    action,
    module,
    target: target ?? null,
    details: details ?? {},
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*, departments(name), work_schedules(name, start_time, end_time)")
      .eq("id", userId)
      .single();
    setProfile((data as unknown as Profile) ?? null);
    return data as unknown as Profile | null;
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(username: string, password: string) {
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: "Invalid username or password." };
    }
    const p = await loadProfile(data.user.id);
    if (!p) {
      await supabase.auth.signOut();
      return { error: "Account not found. Contact your administrator." };
    }
    if (p.status !== "active") {
      await supabase.auth.signOut();
      return { error: "This account has been deactivated. Contact your administrator." };
    }
    await logAudit("Login", "Authentication", p.username, {}, p.company_id, p.id, `${p.first_name} ${p.last_name}`);
    return { error: null };
  }

  async function signOut() {
    if (profile) {
      await logAudit("Logout", "Authentication", profile.username, {}, profile.company_id, profile.id, `${profile.first_name} ${profile.last_name}`);
    }
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
