import "server-only";
import { z } from "zod";
import { cacheLife, cacheTag } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Messages in the moving bar at the very top of the store (Admin → Top Bar Messages).
 * Kept in store_settings["marketing.announcements"], a public setting.
 */
export const ANNOUNCEMENTS_SETTING = "marketing.announcements";
export const ANNOUNCEMENTS_TAG = "announcements";

export const announcement = z.object({
  text: z.string().trim().min(2, "Write the message.").max(90, "Keep each message under 90 characters."),
  /** Optional link: a page on this site ("/offers") or a full https link. */
  href: z
    .string()
    .trim()
    .max(300)
    .refine((v) => !v || /^\/[^/\\]/.test(v) || v === "/" || /^https:\/\//.test(v), "Use a page like /offers or a full https:// link."),
});
export type Announcement = z.infer<typeof announcement>;
export const announcementList = z.array(announcement).max(10, "Use at most 10 messages.");

export const DEFAULT_ANNOUNCEMENTS: Announcement[] = [
  { text: "🚚 Free delivery on prepaid orders", href: "/shop" },
  { text: "💳 Extra discount when you pay online", href: "/shop" },
  { text: "🎁 Big offers on kids' rides", href: "/offers" },
  { text: "✅ Genuine products, trusted & safe shopping", href: "" },
  { text: "🔧 Book a service for your kid's vehicle", href: "/book-service" },
];

export async function getAnnouncements(): Promise<Announcement[]> {
  "use cache";
  cacheTag(ANNOUNCEMENTS_TAG);
  cacheLife("hours");
  if (!isSupabaseConfigured) return DEFAULT_ANNOUNCEMENTS;
  try {
    const supabase = createPublicClient();
    const { data } = await supabase.from("store_settings").select("value").eq("key", ANNOUNCEMENTS_SETTING).maybeSingle();
    if (!data) return DEFAULT_ANNOUNCEMENTS;
    const parsed = announcementList.safeParse((data as { value?: unknown }).value);
    return parsed.success ? parsed.data : DEFAULT_ANNOUNCEMENTS;
  } catch {
    return DEFAULT_ANNOUNCEMENTS;
  }
}
