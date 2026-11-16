"use server";

import { refresh, revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { assertCan } from "@/features/auth/session";
import { INSTAGRAM_SETTING, INSTAGRAM_TAG, instagramPost } from "@/features/marketing/instagram";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function saveInstagramPostsAction(posts: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Needs Supabase." };
  try {
    await assertCan("cms", "edit");
  } catch {
    return { ok: false, error: "You don't have permission to edit website content." };
  }
  const parsed = z.array(instagramPost).max(12, "Show at most 12 posts.").safeParse(posts);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the posts." };
  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").upsert({ key: INSTAGRAM_SETTING, value: parsed.data, is_public: true }, { onConflict: "key" });
  if (error) return { ok: false, error: "Couldn't save. You need the Settings edit permission too." };
  revalidateTag(INSTAGRAM_TAG, "max");
  revalidatePath("/");
  refresh();
  return { ok: true };
}
