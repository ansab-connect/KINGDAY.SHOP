"use client";

import { useEffect, useState } from "react";
import { Play, X, ZoomIn } from "lucide-react";
import { ProductVisual } from "@/components/store/product-visual";
import type { ProductImage } from "@/features/catalog/types";
import type { SocialVideo } from "@/lib/social-video";
import { cn } from "@/lib/utils";

type Slide = { kind: "image"; image?: ProductImage } | { kind: "video"; src: string };

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
  /** Instagram reel / YouTube video: a separate "Video" button on the photo opens it in a popup. */
  social?: SocialVideo | null;
  categorySlug: string;
  name: string;
}) {
  const slides: Slide[] = [
    ...(images.length ? images.map((image) => ({ kind: "image" as const, image })) : [{ kind: "image" as const }]),
    ...(video ? [{ kind: "video" as const, src: video }] : []),
  ];
  const [watching, setWatching] = useState(false);
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
                {s.kind === "video" ? (
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
        {current.kind === "video" ? (
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
        {social ? <WatchButton video={social} onClick={() => setWatching(true)} /> : null}
      </div>
      {social && watching ? <VideoPopup video={social} name={name} onClose={() => setWatching(false)} /> : null}
    </div>
  );
}

/** "Video" button on the product photo, with the reel's cover as a small preview. */
function WatchButton({ video, onClick }: { video: SocialVideo; onClick: () => void }) {
  const [broken, setBroken] = useState(false);
  const insta = video.kind === "instagram";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={insta ? "Watch the Instagram video" : "Watch the YouTube video"}
      className={cn(
        "absolute bottom-4 left-4 z-10 inline-flex items-center gap-2 rounded-full p-1 pr-4 text-sm font-bold text-white shadow-lift transition-transform hover:scale-105",
        insta ? "bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af]" : "bg-[#ff0000]",
      )}
    >
      <span className="relative grid size-9 place-items-center overflow-hidden rounded-full bg-black/30">
        {video.thumb && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Instagram/YouTube cover
          <img src={video.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover opacity-70" />
        ) : null}
        <Play aria-hidden className="relative ml-0.5 size-4 fill-white" />
      </span>
      Video
    </button>
  );
}

/** Popup player. The Instagram/YouTube player loads only when opened. Esc or the backdrop closes it. */
function VideoPopup({ video, name, onClose }: { video: SocialVideo; name: string; onClose: () => void }) {
  const label = video.kind === "instagram" ? "Instagram video" : "YouTube video";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={`${name}: ${label}`} className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-4" onClick={onClose}>
      <div className={cn("relative w-full", video.vertical ? "max-w-[min(26rem,calc(85dvh*9/16))]" : "max-w-3xl")} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close video" className="absolute -top-12 right-0 grid size-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25">
          <X aria-hidden className="size-5" />
        </button>
        <div className={cn("overflow-hidden rounded-2xl bg-black", video.vertical ? "aspect-[9/16] max-h-[85dvh]" : "aspect-video")}>
          <iframe src={video.embed} title={`${name}: ${label}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="size-full border-0" />
        </div>
      </div>
    </div>
  );
}
