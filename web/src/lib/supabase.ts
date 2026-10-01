import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY environment variables");
}

// "Remember me" support: when unchecked, the session lives only in
// sessionStorage (cleared when the browser/tab closes) instead of
// localStorage. The flag itself is stored in localStorage so it survives
// across the redirect Supabase does during auth.
const REMEMBER_KEY = "attendance_remember_me";
export function setRememberMe(remember: boolean) {
  localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
}
function activeStorage() {
  return localStorage.getItem(REMEMBER_KEY) === "0" ? sessionStorage : localStorage;
}
const dynamicStorage = {
  getItem: (key: string) => activeStorage().getItem(key),
  setItem: (key: string, value: string) => activeStorage().setItem(key, value),
  removeItem: (key: string) => activeStorage().removeItem(key),
};

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storage: dynamicStorage as any },
});

// Username-based login: usernames map to a synthetic, never-delivered email
// (`<username>@employee.local`) under the hood so Supabase Auth (which is
// email/password) can be used with plain usernames.
export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@employee.local`;
}

const FUNCTIONS_URL = `${url}/functions/v1`;

export async function callAdminFunction<T = any>(op: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${FUNCTIONS_URL}/admin-users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ op, ...payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}
