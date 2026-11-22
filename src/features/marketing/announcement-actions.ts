"use server";

import { refresh, revalidatePath, revalidateTag } from "next/cache";
import { assertCan } from "@/features/auth/session";
import { ANNOUNCEMENTS_SETTING, ANNOUNCEMENTS_TAG, announcementList } from "@/features/marketing/announcements";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function saveAnnouncementsAction(items: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Needs Supabase." };
  try {
    await assertCan("cms", "edit");
  } catch {
    return { ok: false, error: "You don't have permission to edit website content." };
  }
  const parsed = announcementList.safeParse(items);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the messages." };
  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").upsert({ key: ANNOUNCEMENTS_SETTING, value: parsed.data, is_public: true }, { onConflict: "key" });
  if (error) return { ok: false, error: "Couldn't save. You need the Settings edit permission too." };
  revalidateTag(ANNOUNCEMENTS_TAG, "max");
  revalidatePath("/", "layout");
  refresh();
  return { ok: true };
}
