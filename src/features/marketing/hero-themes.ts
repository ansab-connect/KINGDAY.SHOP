import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { publicStorageUrl } from "@/lib/storage";
import { createPublicClient } from "@/lib/supabase/public";
import {
  DEFAULT_HERO_THEMES,
  HERO_THEMES_SETTING,
  HERO_THEMES_TAG,
  heroThemesValue,
  resolveHeroTheme,
  todayInIndia,
  type HeroTheme,
  type HeroThemesValue,
} from "./hero-theme-config";

/** All hero themes (the built-in set until the admin saves their own). */
export async function getHeroThemes(): Promise<HeroThemesValue> {
  "use cache";
  cacheTag(HERO_THEMES_TAG);
  cacheLife("hours");
  if (!isSupabaseConfigured) return DEFAULT_HERO_THEMES;
  try {
    const { data } = await createPublicClient().from("store_settings").select("value").eq("key", HERO_THEMES_SETTING).maybeSingle();
    const parsed = heroThemesValue.safeParse((data as { value?: unknown } | null)?.value);
    return parsed.success ? parsed.data : DEFAULT_HERO_THEMES;
  } catch {
    return DEFAULT_HERO_THEMES;
  }
}

export type ResolvedHeroTheme = HeroTheme & { sceneUrls: (string | null)[] };

/** Today's theme with its banner image URLs (cached for an hour, so it switches on its dates). */
export async function getActiveHeroTheme(): Promise<ResolvedHeroTheme> {
  "use cache";
  cacheTag(HERO_THEMES_TAG);
  cacheLife("hours");
  const theme = resolveHeroTheme(await getHeroThemes(), todayInIndia());
  return withSceneUrls(theme);
}

export function withSceneUrls(theme: HeroTheme): ResolvedHeroTheme {
  return { ...theme, sceneUrls: theme.scenes.map((s) => publicStorageUrl("category-images", s.image_path)) };
}
