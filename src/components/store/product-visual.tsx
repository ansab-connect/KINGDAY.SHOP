import Image from "next/image";
import { Baby, Bike, Blocks, Car, Scooter, Sparkles, type LucideProps } from "lucide-react";
import type { ProductImage } from "@/features/catalog/types";
import { cn } from "@/lib/utils";

/** Category pictogram (decorative). */
export function CategoryIcon({ slug, ...props }: LucideProps & { slug: string }) {
  switch (slug) {
    case "electric-jeeps-cars":
      return <Car aria-hidden {...props} />;
    case "bikes":
    case "tricycles":
    case "cycles":
      return <Bike aria-hidden {...props} />;
    case "scooters":
      return <Scooter aria-hidden {...props} />;
    case "toys":
      return <Blocks aria-hidden {...props} />;
    case "baby-accessories":
      return <Baby aria-hidden {...props} />;
    default:
      return <Sparkles aria-hidden {...props} />;
  }
}

/**
 * Product image, or, until real photography is uploaded (Phase 5), a branded
 * placeholder built from the category icon.
 */
export function ProductVisual({
  image,
  categorySlug,
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw",
  priority = false,
  className,
  iconClassName,
}: {
  image?: ProductImage;
  categorySlug: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  if (image) {
    return (
      <div className={cn("relative overflow-hidden bg-muted", className)}>
        <Image src={image.src} alt={image.alt} fill sizes={sizes} preload={priority} className="object-cover" />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label="Product photo coming soon"
      className={cn(
        "relative grid place-items-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_10%,var(--color-royal-50)_0%,#ffffff_60%,var(--color-gold-50)_100%)]",
        className,
      )}
    >
      <span aria-hidden className="absolute size-[62%] rounded-full border border-gold-200/80" />
      <span aria-hidden className="absolute size-[44%] rounded-full bg-white/70 shadow-[0_20px_50px_-20px_rgb(75_0_130/0.35)]" />
      <CategoryIcon slug={categorySlug} strokeWidth={1.25} className={cn("relative size-[30%] text-royal-400", iconClassName)} />
    </div>
  );
}
