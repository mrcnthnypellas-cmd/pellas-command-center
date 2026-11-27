import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Public project URL and publishable (anon) key. These are designed to be
// public: every request is still checked by database row-level security.
// Never put the service-role key in frontend code.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true when the site runs against the real Supabase backend (production). */
export const LIVE = !!(url && key);

export const supabase: SupabaseClient | null = LIVE ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

export function sb(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}
