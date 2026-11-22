"use client";

import { useState } from "react";
import { Play, ZoomIn } from "lucide-react";
import { ProductVisual } from "@/components/store/product-visual";
import type { ProductImage } from "@/features/catalog/types";
import type { SocialVideo } from "@/lib/social-video";
import { cn } from "@/lib/utils";

type Slide = { kind: "image"; image?: ProductImage } | { kind: "video"; src: string } | { kind: "social"; video: SocialVideo };

/** Product gallery: thumbnails, hover/tap zoom on images, optional product video. */
export function ProductGallery({
  images,
  video,
  social = null,
  categorySlug,
  name,
}: {
  images: ProductImage[];
  video: string | null;
  /** Instagram reel / YouTube video, shown second so shoppers see it straight away. */
  social?: SocialVideo | null;
  categorySlug: string;
  name: string;
}) {
  const pictures: Slide[] = images.length ? images.map((image) => ({ kind: "image" as const, image })) : [{ kind: "image" as const }];
  const slides: Slide[] = [
    pictures[0],
    ...(social ? [{ kind: "social" as const, video: social }] : []),
    ...pictures.slice(1),
    ...(video ? [{ kind: "video" as const, src: video }] : []),
  ];
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const current = slides[index];

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row">
      {slides.length > 1 ? (
        <ul className="flex gap-2 sm:flex-col" aria-label="Product media">
          {slides.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={s.kind === "image" ? `Show image ${i + 1}` : "Play product video"}
                aria-current={i === index}
                className={cn("relative size-16 overflow-hidden rounded-xl ring-2 transition-all sm:size-20", i === index ? "ring-royal" : "ring-transparent hover:ring-royal-200")}
              >
                {s.kind === "social" ? (
                  <span className="relative block size-full">
                    <SocialCover video={s.video} fallback={images[0]} categorySlug={categorySlug} sizes="80px" />
                    <span className="absolute inset-0 grid place-items-center bg-black/25 text-white"><Play aria-hidden className="size-6 fill-white" /></span>
                  </span>
                ) : s.kind === "video" ? (
                  <span className="grid size-full place-items-center bg-deep text-gold"><Play aria-hidden className="size-6" /></span>
                ) : (
                  <ProductVisual image={s.image} categorySlug={categorySlug} sizes="80px" className="size-full" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative flex-1">
        {current.kind === "social" ? (
          <SocialPlayer video={current.video} fallback={images[0]} categorySlug={categorySlug} name={name} />
        ) : current.kind === "video" ? (
          <video src={current.src} controls playsInline preload="metadata" className="aspect-square w-full rounded-3xl bg-deep object-contain" aria-label={`${name} video`} />
        ) : (
          <div
            className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-3xl ring-1 ring-border/70"
            onPointerMove={move}
            onPointerEnter={move}
            onPointerLeave={() => setZoom(null)}
          >
            <div
              className="size-full transition-transform duration-200 ease-out"
              style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            >
              <ProductVisual image={current.image} categorySlug={categorySlug} priority sizes="(min-width: 1024px) 50vw, 100vw" className="size-full" />
            </div>
            <span className="pointer-events-none absolute right-4 bottom-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-deep shadow-sm backdrop-blur transition-opacity group-hover:opacity-0">
              <ZoomIn aria-hidden className="size-3.5" /> Zoom
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Reel / video cover: its own thumbnail, else the product photo. */
function SocialCover({ video, fallback, categorySlug, sizes }: { video: SocialVideo; fallback?: ProductImage; categorySlug: string; sizes: string }) {
  const [broken, setBroken] = useState(false);
  if (video.thumb && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Instagram/YouTube cover
      <img src={video.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
    );
  }
  return <ProductVisual image={fallback} categorySlug={categorySlug} sizes={sizes} className="size-full" />;
}

/** Cover with a play button; the Instagram/YouTube player loads only when tapped. */
function SocialPlayer({ video, fallback, categorySlug, name }: { video: SocialVideo; fallback?: ProductImage; categorySlug: string; name: string }) {
  const [playing, setPlaying] = useState(false);
  const label = video.kind === "instagram" ? "Instagram reel" : "YouTube video";
  if (playing) {
    return (
      <div className={cn("mx-auto w-full overflow-hidden rounded-3xl bg-black", video.vertical ? "aspect-[9/16] max-h-[85vh] max-w-[min(100%,calc(85vh*9/16))]" : "aspect-video")}>
        <iframe
          src={video.embed}
          title={`${name}: ${label}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="size-full border-0"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group relative block aspect-square w-full overflow-hidden rounded-3xl bg-deep ring-1 ring-border/70"
      aria-label={`Play ${label}`}
    >
      <SocialCover video={video} fallback={fallback} categorySlug={categorySlug} sizes="(min-width: 1024px) 50vw, 100vw" />
      <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-16 place-items-center rounded-full bg-white/95 text-royal shadow-lg transition-transform group-hover:scale-110 sm:size-20">
          <Play aria-hidden className="ml-1 size-7 fill-royal sm:size-9" />
        </span>
      </span>
      <span
        className={cn(
          "absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow",
          video.kind === "instagram" ? "bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af]" : "bg-[#ff0000]",
        )}
      >
        <Play aria-hidden className="size-3 fill-white" /> {video.kind === "instagram" ? "Watch reel" : "Watch video"}
      </span>
    </button>
  );
}
