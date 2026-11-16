import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * "Royal Moments": an Admin-managed gallery of real @kingday.official posts
 * (owner's choice; no Meta API token is needed or stored). Kept in
 * store_settings["marketing.instagram_posts"], a public setting.
 */

export const INSTAGRAM_URL = "https://www.instagram.com/kingday.official/";
export const INSTAGRAM_SETTING = "marketing.instagram_posts";

export const instagramPost = z.object({
  url: z
    .string()
    .trim()
    .regex(/^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]{5,40}\/?(\?.*)?$/, "Paste the link of a post or reel from instagram.com."),
  image_path: z.string().regex(/^instagram\/[a-z0-9-]{6,80}\.(webp|jpg|jpeg|png|avif)$/, "Upload the post's picture."),
  caption: z.string().trim().max(150),
});
export type InstagramPost = z.infer<typeof instagramPost>;

export async function getInstagramPosts(): Promise<InstagramPost[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("store_settings").select("value").eq("key", INSTAGRAM_SETTING).maybeSingle();
    const parsed = z.array(instagramPost).max(12).safeParse((data as { value?: unknown } | null)?.value ?? []);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
