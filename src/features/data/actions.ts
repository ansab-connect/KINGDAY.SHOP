"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { getCleanupSettings, runCleanup, saveCleanupSettings } from "@/features/data/temporary";
import { createAdminClient } from "@/lib/supabase/admin";

type R = { ok: boolean; message: string };
const superOnly = async () => Boolean((await getCurrentUser())?.roles.includes("super_admin"));

export async function saveCleanupPlanAction(input: { date: string; every_days: number; keep_days: number }): Promise<R> {
  if (!(await superOnly())) return { ok: false, message: "Super Admin only." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, message: "Choose a date." };
  const every = Math.round(Number(input.every_days));
  const keep = Math.round(Number(input.keep_days));
  if (!(every >= 7 && every <= 365) || !(keep >= 7 && keep <= 730)) return { ok: false, message: "Use 7–365 days for repeat and 7–730 days to keep." };
  const db = createAdminClient();
  const s = await getCleanupSettings(db);
  const { error } = await saveCleanupSettings(db, { ...s, date: input.date, every_days: every, keep_days: keep });
  if (error) return { ok: false, message: "Could not save." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function cleanNowAction(): Promise<R> {
  if (!(await superOnly())) return { ok: false, message: "Super Admin only." };
  const r = await runCleanup(createAdminClient(), { force: true });
  refresh();
  return { ok: true, message: r.message };
}
