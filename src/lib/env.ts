import { z } from "zod";

/**
 * Public (browser-safe) configuration. NEXT_PUBLIC_* values are inlined at build time,
 * so they are read with literal property access.
 */
const publicSchema = z.object({
  siteUrl: z.url().default("http://localhost:3000"),
  supabaseUrl: z.url().optional(),
  supabaseAnonKey: z.string().min(20).optional(),
});

const parsed = publicSchema.safeParse({
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
});

if (!parsed.success) {
  throw new Error(`Invalid public environment variables: ${z.prettifyError(parsed.error)}`);
}

export const publicEnv = parsed.data;

/** True when Supabase URL and anon key are both present. */
export const isSupabaseConfigured = Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);

export function requireSupabasePublicEnv() {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return { url: publicEnv.supabaseUrl, anonKey: publicEnv.supabaseAnonKey };
}
