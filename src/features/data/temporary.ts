import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Temporary data = big files we don't need forever. Permanent data (customers, orders,
 * invoices, payments, bookings, products, accounts) is never touched here.
 * Flow: owner downloads the temporary files (ZIP) → on the clean date, only the files that
 * were downloaded are deleted; each booking keeps a one-line overview of what was removed.
 */

export const CLEANUP_KEY = "data.cleanup";
export type CleanupSettings = {
  /** Next clean date, YYYY-MM-DD. */
  date: string;
  /** Repeat every N days after a clean. */
  every_days: number;
  /** A closed job's files become temporary this many days after it was closed. */
  keep_days: number;
  /** Bookings whose files were downloaded (and so may be cleaned). */
  downloaded_ids: string[];
  downloaded_at: string | null;
  last_clean_at: string | null;
  last_clean_summary: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export function defaultSettings(): CleanupSettings {
  return { date: addDays(today(), 30), every_days: 30, keep_days: 60, downloaded_ids: [], downloaded_at: null, last_clean_at: null, last_clean_summary: null };
}

export async function getCleanupSettings(db: SupabaseClient): Promise<CleanupSettings> {
  const { data } = await db.from("store_settings").select("value").eq("key", CLEANUP_KEY).maybeSingle();
  return { ...defaultSettings(), ...((data as { value: Partial<CleanupSettings> } | null)?.value ?? {}) };
}

export async function saveCleanupSettings(db: SupabaseClient, value: CleanupSettings) {
  return db.from("store_settings").upsert({ key: CLEANUP_KEY, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export type TempBooking = { id: string; booking_code: string; customer_name: string; status: string; updated_at: string; voice_path: string | null; voice_duration_seconds: number | null; photo_paths: string[] };

/** Closed jobs (invoiced or cancelled) older than keep_days that still hold a voice note or photos. */
export async function findTemporaryBookings(db: SupabaseClient, keepDays: number): Promise<TempBooking[]> {
  const before = new Date(Date.now() - keepDays * 86400000).toISOString();
  const { data } = await db
    .from("service_bookings")
    .select("id, booking_code, customer_name, status, updated_at, voice_path, voice_duration_seconds, photo_paths")
    .in("status", ["invoiced", "cancelled"])
    .lt("updated_at", before)
    .is("media_cleaned_at", null)
    .order("updated_at")
    .limit(500);
  return ((data ?? []) as TempBooking[]).filter((b) => b.voice_path || b.photo_paths?.length);
}

const filesOf = (b: TempBooking) => [...(b.voice_path ? [b.voice_path] : []), ...(b.photo_paths ?? [])];

export function overview(b: TempBooking): string {
  const parts = [
    b.voice_path ? `voice note${b.voice_duration_seconds ? ` (${Math.floor(b.voice_duration_seconds / 60)}:${String(b.voice_duration_seconds % 60).padStart(2, "0")})` : ""}` : null,
    b.photo_paths?.length ? `${b.photo_paths.length} photo${b.photo_paths.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return `${parts.join(" and ")} removed to save space on ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} (downloaded in the temporary-files backup).`;
}

export { filesOf };

/** Clean the downloaded files (service role). Also clears read notifications older than 90 days. */
export async function runCleanup(db: SupabaseClient, opts: { force?: boolean } = {}): Promise<{ ran: boolean; message: string }> {
  const s = await getCleanupSettings(db);
  if (!opts.force && s.date > today()) return { ran: false, message: `Next clean on ${s.date}.` };
  const ready = new Set(s.downloaded_ids);
  const due = (await findTemporaryBookings(db, s.keep_days)).filter((b) => ready.has(b.id));
  let files = 0;
  let jobs = 0;
  for (const b of due) {
    const paths = filesOf(b);
    const { error } = await db.storage.from("service-media").remove(paths);
    if (error) continue;
    const { error: e2 } = await db.from("service_bookings").update({ voice_path: null, photo_paths: [], media_cleaned_at: new Date().toISOString(), media_summary: overview(b) }).eq("id", b.id);
    if (!e2) {
      files += paths.length;
      jobs += 1;
    }
  }
  const old = new Date(Date.now() - 90 * 86400000).toISOString();
  const { count: notes } = await db.from("notifications").delete({ count: "exact" }).not("read_at", "is", null).lt("created_at", old);
  const msg = `${files} file(s) from ${jobs} job(s) removed, ${notes ?? 0} old read notification(s) cleared.`;
  const done = new Set(due.map((b) => b.id));
  await saveCleanupSettings(db, {
    ...s,
    date: addDays(today(), s.every_days),
    downloaded_ids: s.downloaded_ids.filter((id) => !done.has(id)),
    last_clean_at: new Date().toISOString(),
    last_clean_summary: msg,
  });
  return { ran: true, message: msg };
}

/** Read notifications older than 90 days (cleaned on the clean date). */
export async function countOldNotifications(db: SupabaseClient): Promise<number> {
  const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).not("read_at", "is", null).lt("created_at", new Date(Date.now() - 90 * 86400000).toISOString());
  return count ?? 0;
}
