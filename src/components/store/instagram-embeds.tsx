import { parseSocialVideo } from "@/lib/social-video";

/**
 * "Royal Moments": the real Instagram posts/reels, shown with Instagram's own player
 * (the video plays right here, no thumbnails needed). Each player loads only when it
 * scrolls near the screen, so the homepage stays fast. Swipe sideways for more.
 */
export function InstagramEmbeds({ posts }: { posts: { url: string; caption: string }[] }) {
  const items = posts.map((p) => ({ ...p, video: parseSocialVideo(p.url) })).filter((p) => p.video);
  if (!items.length) return null;
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {items.map((p) => (
        <li key={p.url} className="w-[82%] max-w-[20rem] shrink-0 snap-start sm:w-[20rem]">
          <div className="overflow-hidden rounded-2xl border bg-white shadow-card">
            <iframe
              src={p.video!.embed}
              title={p.caption || "KING DAY on Instagram"}
              loading="lazy"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              scrolling="no"
              className="block h-[34rem] w-full border-0 sm:h-[36rem]"
            />
          </div>
          {p.caption ? <p className="mt-2 line-clamp-2 px-1 text-sm text-muted-foreground">{p.caption}</p> : null}
        </li>
      ))}
    </ul>
  );
}
