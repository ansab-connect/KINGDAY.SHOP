"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";

const noop = () => () => {};
import { L } from "@/components/i18n/lang";
import type { SocialVideo } from "@/lib/social-video";
import { ProductGallery } from "@/components/store/product/product-gallery";
import type { ProductImage, StoreVariant } from "@/features/catalog/types";

/**
 * The combination the shopper has chosen, shared by the gallery, the purchase panel and
 * the specifications table so all three update together.
 */
type Selection = { variants: StoreVariant[]; variant: StoreVariant; select: (id: string) => void };

const VariantContext = createContext<Selection | null>(null);

export function VariantSelectionProvider({
  variants,
  defaultVariantId,
  children,
}: {
  variants: StoreVariant[];
  defaultVariantId: string;
  children: React.ReactNode;
}) {
  // null until the shopper picks one. Opened from a category listing that shows one
  // variant (?v=<id>), the page starts on that variant; otherwise on the default.
  const [picked, setPicked] = useState<string | null>(null);
  const search = useSyncExternalStore(noop, () => window.location.search, () => "");
  const fromUrl = new URLSearchParams(search).get("v");
  const id = picked ?? (fromUrl && variants.some((v) => v.id === fromUrl) ? fromUrl : defaultVariantId);
  const value = useMemo<Selection>(
    () => ({ variants, variant: variants.find((v) => v.id === id) ?? variants[0], select: setPicked }),
    [variants, id],
  );
  return <VariantContext.Provider value={value}>{children}</VariantContext.Provider>;
}

export function useVariantSelection(): Selection {
  const ctx = useContext(VariantContext);
  if (!ctx) throw new Error("useVariantSelection must be used inside VariantSelectionProvider");
  return ctx;
}

/** Gallery for the selected combination: its own images, else the product's shared images. */
export function VariantGallery({
  sharedImages,
  video,
  social = null,
  categorySlug,
  name,
}: {
  sharedImages: ProductImage[];
  video: string | null;
  social?: SocialVideo | null;
  categorySlug: string;
  name: string;
}) {
  const { variant } = useVariantSelection();
  const images = variant.images.length ? variant.images : sharedImages;
  // Re-mount when the picture set changes so the gallery starts at the first image.
  const key = images.map((i) => i.src).join("|") || "none";
  return <ProductGallery key={key} images={images} video={video} social={social} categorySlug={categorySlug} name={name} />;
}

/** Specifications table: product specs, with the selected combination's specs taking priority. */
export function VariantSpecs({ specs, categoryName }: { specs: { label: string; value: string }[]; categoryName: string }) {
  const { variant } = useVariantSelection();
  const own = new Map(variant.specs.map((s) => [s.label.toLowerCase(), s]));
  const merged = [
    ...specs.map((s) => own.get(s.label.toLowerCase()) ?? s),
    ...variant.specs.filter((s) => !specs.some((b) => b.label.toLowerCase() === s.label.toLowerCase())),
  ];
  return (
    <dl className="mt-4 divide-y overflow-hidden rounded-2xl border">
      {merged.map((s) => (
        <div key={s.label} className="grid grid-cols-[42%_1fr] gap-4 px-5 py-3 text-sm odd:bg-muted/40">
          <dt className="text-muted-foreground">{s.label}</dt>
          <dd className="font-medium text-deep">{s.value}</dd>
        </div>
      ))}
      <div className="grid grid-cols-[42%_1fr] gap-4 px-5 py-3 text-sm">
        <dt className="text-muted-foreground">
          <L en="Category" ml="വിഭാഗം" />
        </dt>
        <dd className="font-medium text-deep">{categoryName}</dd>
      </div>
    </dl>
  );
}

/**
 * Small plain-text facts under the photos: the cycle size of the chosen variant (cycles only)
 * and the product's warranty. Nothing is shown when there is neither.
 */
export function ProductFacts({ size, variantSizes, warranties }: { size: string | null; variantSizes: Record<string, string>; warranties: string[] }) {
  const { variant } = useVariantSelection();
  const s = variantSizes[variant.id] ?? size;
  if (!s && !warranties.length) return null;
  return (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      {s ? <p>Size: <span className="text-deep">{s}</span></p> : null}
      {warranties.map((w) => <p key={w}>{w}</p>)}
    </div>
  );
}
