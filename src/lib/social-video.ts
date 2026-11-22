/**
 * Instagram reel / YouTube links pasted on a product. We never store embed code, only the
 * link; the player URL and thumbnail are worked out from the video ID.
 */
export type SocialVideo =
  | { kind: "youtube"; id: string; url: string; embed: string; thumb: string; vertical: boolean }
  | { kind: "instagram"; id: string; url: string; embed: string; thumb: string | null; vertical: true };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_ID = /^[A-Za-z0-9_-]{5,40}$/;

export function parseSocialVideo(raw: string | null | undefined): SocialVideo | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    let id: string | null = null;
    let vertical = false;
    if (host === "youtu.be") id = parts[0] ?? null;
    else if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (parts[0] === "shorts") [id, vertical] = [parts[1] ?? null, true];
    else if (parts[0] === "embed" || parts[0] === "live") id = parts[1] ?? null;
    if (!id || !YT_ID.test(id)) return null;
    return {
      kind: "youtube",
      id,
      url: vertical ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
      embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      vertical,
    };
  }

  if (host === "instagram.com") {
    // /reel/CODE, /reels/CODE, /p/CODE, /tv/CODE, also /username/reel/CODE
    const i = parts.findIndex((p) => ["reel", "reels", "p", "tv"].includes(p));
    const id = i >= 0 ? parts[i + 1] : undefined;
    if (!id || !IG_ID.test(id)) return null;
    const type = parts[i] === "p" ? "p" : "reel";
    return {
      kind: "instagram",
      id,
      url: `https://www.instagram.com/${type}/${id}/`,
      embed: `https://www.instagram.com/${type}/${id}/embed/`,
      thumb: null,
      vertical: true,
    };
  }
  return null;
}

/** Normalised link to store, or null when it isn't an Instagram/YouTube video link. */
export function normaliseSocialVideoUrl(raw: string | null | undefined): string | null {
  return parseSocialVideo(raw)?.url ?? null;
}
