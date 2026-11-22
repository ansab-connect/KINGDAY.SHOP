import { cacheLife, cacheTag } from "next/cache";
import { parseSocialVideo, type SocialVideo } from "@/lib/social-video";

/**
 * Reel cover for an Instagram link, read from Instagram's public embed page (no API key).
 * Instagram's image links expire after a while, so this is cached for hours, not stored.
 * Returns null if Instagram doesn't answer; the gallery then uses the product photo.
 */
async function instagramThumb(embedUrl: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("social-video-thumb");
  try {
    const res = await fetch(embedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KingDayStore/1.0)", Accept: "text/html" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/) ??
      html.match(/<img[^>]*class="EmbeddedMediaImage"[^>]*>/) ??
      html.match(/property="og:image"\s+content="([^"]+)"/);
    const src = m?.[1] ?? m?.[0]?.match(/src="([^"]+)"/)?.[1];
    if (!src) return null;
    const url = src.replace(/&amp;/g, "&");
    return /^https:\/\/[^/]*(cdninstagram\.com|fbcdn\.net)\//.test(url) ? url : null;
  } catch {
    return null;
  }
}

/** Parsed video link with its thumbnail filled in. */
export async function resolveSocialVideo(link: string | null): Promise<SocialVideo | null> {
  const v = parseSocialVideo(link);
  if (!v || v.kind !== "instagram") return v;
  return { ...v, thumb: await instagramThumb(v.embed) };
}
