"use client";

import { useState } from "react";
import { Play, ZoomIn } from "lucide-react";
import { ProductVisual } from "@/components/store/product-visual";
import type { ProductImage } from "@/features/catalog/types";
import { cn } from "@/lib/utils";

type Slide = { kind: "image"; image?: ProductImage } | { kind: "video"; src: string };

/** Product gallery: thumbnails, hover/tap zoom on images, optional product video. */
export function ProductGallery({
  images,
  video,
  categorySlug,
  name,
}: {
  images: ProductImage[];
  video: string | null;
  categorySlug: string;
  name: string;
}) {
  const slides: Slide[] = [
    ...(images.length ? images.map((image) => ({ kind: "image" as const, image })) : [{ kind: "image" as const }]),
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
                aria-label={s.kind === "video" ? "Play product video" : `Show image ${i + 1}`}
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
      </div>
    </div>
  );
}
