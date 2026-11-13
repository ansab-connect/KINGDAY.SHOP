import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireSupabasePublicEnv } from "@/lib/env";

/**
 * Anonymous, cookie-free Supabase client for public catalogue reads.
 * Safe inside 'use cache' (no per-user data); RLS limits it to public rows.
 */
export function createPublicClient() {
  const { url, anonKey } = requireSupabasePublicEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
