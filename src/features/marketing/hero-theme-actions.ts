"use server";

import { refresh, revalidatePath, revalidateTag } from "next/cache";
import { assertCan, getCurrentUser } from "@/features/auth/session";
import { customerCharacters, HERO_THEMES_SETTING, HERO_THEMES_TAG, heroThemesValue } from "@/features/marketing/hero-theme-config";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean; error?: string };

export async function saveHeroThemesAction(value: unknown): Promise<Result> {
  if (!isSupabaseConfigured) return { ok: false, error: "Needs Supabase." };
  try {
    await assertCan("cms", "edit");
  } catch {
    return { ok: false, error: "You don't have permission to edit website content." };
  }
  const parsed = heroThemesValue.safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the themes." };
  const ids = parsed.data.themes.map((t) => t.id);
  if (new Set(ids).size !== ids.length) return { ok: false, error: "Two themes have the same ID." };
  if (!parsed.data.themes.some((t) => t.id === parsed.data.default_id && t.kind === "default")) {
    return { ok: false, error: "Choose a default theme (type Default)." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").upsert({ key: HERO_THEMES_SETTING, value: parsed.data, is_public: true }, { onConflict: "key" });
  if (error) return { ok: false, error: "Couldn't save. You need the Settings edit permission too." };
  revalidateTag(HERO_THEMES_TAG, "max");
  revalidatePath("/");
  refresh();
  return { ok: true };
}

/** Saves the signed-in customer's characters (up to 3) in their account metadata. */
export async function saveMyCharactersAction(list: unknown): Promise<Result> {
  if (!isSupabaseConfigured) return { ok: false, error: "Needs Supabase." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const parsed = customerCharacters.safeParse(list);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your characters." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { characters: parsed.data } });
  if (error) return { ok: false, error: "Couldn't save. Please try again." };
  return { ok: true };
}
