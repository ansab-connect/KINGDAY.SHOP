import Link from "next/link";
import { Rating } from "@/components/store/price";
import { CardQuickAdd, CardWishlist } from "@/components/store/product-quick-actions";
import { ProductVisual } from "@/components/store/product-visual";
import { siteConfig } from "@/config/site";
import type { StoreProduct } from "@/features/catalog/types";
import { discountPercent, formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Product card used on every listing (home, shop, categories, search, related, offers).
 * Same size, square image, MRP + offer price + savings, stock status, wishlist and quick add.
 */
export function ProductCard({ product, priority = false }: { product: StoreProduct; priority?: boolean }) {
  const off = discountPercent(product.mrp, product.price);
  const out = product.stock <= 0;
  const low = !out && product.stock <= 5;
  const single = product.variants.length <= 1;
  const v = product.variants.find((x) => x.id === product.defaultVariantId) ?? product.variants[0];
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition-shadow duration-300 hover:shadow-lift">
      <div className="relative">
        <ProductVisual
          image={product.images[0]}
          categorySlug={product.category.slug}
          priority={priority}
          className={cn("aspect-square bg-canvas", out && "opacity-60 grayscale")}
          iconClassName="transition-transform duration-500 ease-royal group-hover:scale-105"
        />
        <div className="pointer-events-none absolute top-2 left-2 flex flex-col items-start gap-1">
          {off >= 5 ? <Tag className="bg-success text-white">{off}% OFF</Tag> : null}
          {product.isBestseller ? <Tag className="bg-deep text-gold">Bestseller</Tag> : null}
          {product.isNew ? <Tag className="bg-royal text-white">New</Tag> : null}
        </div>
        <div className="absolute top-2 right-2">
          <CardWishlist productId={product.id} name={product.name} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-[0.68rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{product.brand?.name ?? product.category.name}</p>
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm leading-snug font-semibold text-deep">
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {product.name}
          </Link>
        </h3>
        {product.reviewCount > 0 ? <Rating value={product.rating} count={product.reviewCount} /> : null}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-1">
          <span className="font-heading text-base font-bold text-deep tabular">{formatPaise(product.price)}</span>
          {off > 0 ? (
            <span className="text-xs text-muted-foreground line-through tabular">
              <span className="sr-only">MRP </span>
              {formatPaise(product.mrp)}
            </span>
          ) : null}
        </div>
        {off > 0 ? <p className="text-xs font-semibold text-success">Save {formatPaise(product.mrp - product.price)}</p> : null}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className={cn("text-xs font-medium", out ? "text-danger" : low ? "text-warning" : "text-success")}>
            {out ? "Out of stock" : low ? `Only ${product.stock} left` : "In stock"}
          </span>
          {single && !out && v ? (
            <CardQuickAdd
              item={{ variantId: v.id, productName: product.name, sku: v.sku, price: v.price, maxQty: Math.max(1, Math.min(v.stock, 5)), url: `${siteConfig.url}/products/${product.slug}` }}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-md px-2 py-0.5 text-[0.65rem] font-bold tracking-wide shadow-sm", className)}>{children}</span>;
}

/** Mobile-first grid: two columns on phones, up to five on wide screens. */
export function ProductGrid({ products, priorityCount = 0 }: { products: StoreProduct[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {products.map((p, i) => (
        <li key={p.id} className="has-[a:focus-visible]:rounded-2xl has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2">
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
