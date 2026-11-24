import { Camera } from "lucide-react";
import { AutoplayReel } from "@/components/store/autoplay-reel";
import { parseSocialVideo } from "@/lib/social-video";
import { publicStorageUrl } from "@/lib/storage";

/**
 * "Royal Moments": real @kingday.official reels. A reel with an uploaded clip plays
 * by itself (muted, looping, only while on screen). Instagram's own player can't
 * autoplay, so posts without a clip fall back to it. Swipe sideways for more.
 */
export function InstagramEmbeds({ posts }: { posts: { url: string; caption: string; image_path?: string; video_path?: string }[] }) {
  const items = posts
    .map((p) => ({
      ...p,
      clip: publicStorageUrl("product-videos", p.video_path || null),
      poster: publicStorageUrl("category-images", p.image_path || null),
      embed: parseSocialVideo(p.url)?.embed ?? null,
    }))
    .filter((p) => p.clip || p.embed);
  if (!items.length) return null;
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {items.map((p) => (
        <li key={p.url} className={p.clip ? "w-[62%] max-w-[16rem] shrink-0 snap-start sm:w-[16rem]" : "w-[82%] max-w-[20rem] shrink-0 snap-start sm:w-[20rem]"}>
          {p.clip ? (
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block aspect-[9/16] overflow-hidden rounded-2xl bg-deep shadow-card ring-1 ring-gold/30"
            >
              <AutoplayReel src={p.clip} poster={p.poster} label={p.caption || "KING DAY reel"} />
              <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-deep/85 to-transparent" />
              <span className="absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm">
                <Camera aria-hidden className="size-4" />
                <span className="sr-only">Open on Instagram</span>
              </span>
              {p.caption ? <span className="absolute inset-x-3 bottom-3 line-clamp-2 text-sm font-medium text-white">{p.caption}</span> : null}
            </a>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border bg-white shadow-card">
                <iframe
                  src={p.embed!}
                  title={p.caption || "KING DAY on Instagram"}
                  loading="lazy"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  scrolling="no"
                  className="block h-[34rem] w-full border-0 sm:h-[36rem]"
                />
              </div>
              {p.caption ? <p className="mt-2 line-clamp-2 px-1 text-sm text-muted-foreground">{p.caption}</p> : null}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
