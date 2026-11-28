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
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-royal-100 hover:shadow-lift">
      <div className="relative">
        <ProductVisual
          image={product.images[0]}
          categorySlug={product.category.slug}
          priority={priority}
          className="aspect-square bg-gradient-to-b from-canvas to-white"
          iconClassName="transition-transform duration-500 ease-royal group-hover:scale-105"
        />
        <div className="pointer-events-none absolute top-2 left-2 flex flex-col items-start gap-1">
          {off >= 5 ? <Tag className="bg-gold text-deep">-{off}%</Tag> : null}
          {product.isNew ? <Tag className="bg-royal text-white">New</Tag> : product.isBestseller ? <Tag className="bg-deep text-gold">Bestseller</Tag> : null}
        </div>
        <div className="absolute top-2 right-2">
          <CardWishlist productId={product.id} name={product.name} />
        </div>
        {out ? <span className="absolute inset-x-0 bottom-0 bg-deep/75 py-1 text-center text-[0.7rem] font-semibold text-white">Out of stock</span> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-3.5">
        {product.brand ? <p className="truncate text-[0.68rem] font-medium text-muted-foreground">{product.brand.name}</p> : null}
        <h3 className="line-clamp-2 min-h-[2.5rem] text-[0.8125rem] leading-snug font-semibold text-deep sm:text-sm">
          <Link href={`/products/${product.slug}${product.listedVariantId ? `?v=${product.listedVariantId}` : ""}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {product.name}
          </Link>
        </h3>
        {product.reviewCount > 0 ? <Rating value={product.rating} count={product.reviewCount} /> : null}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-1.5">
          <span className="text-base font-bold text-deep tabular sm:text-[1.05rem]">{formatPaise(product.price)}</span>
          {off > 0 ? (
            <>
              <span className="text-xs text-muted-foreground line-through tabular">
                <span className="sr-only">MRP </span>
                {formatPaise(product.mrp)}
              </span>
              <span className="text-xs font-semibold text-success">{off}% off</span>
            </>
          ) : null}
        </div>
        <div className="flex min-h-9 items-center justify-between gap-2 pt-1">
          <span className={cn("text-[0.7rem] font-medium", low ? "text-warning" : "text-muted-foreground")}>
            {low ? `Only ${product.stock} left` : ""}
          </span>
          {single && !out && v ? (
            <CardQuickAdd
              item={{ variantId: v.id, productName: product.name, sku: v.sku, price: v.price, maxQty: Math.max(1, Math.min(v.stock, 5)), url: `${siteConfig.url}/products/${product.slug}`, image: product.images[0]?.src ?? null }}
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
        <li key={`${p.id}${p.listedVariantId ?? ""}`} className="has-[a:focus-visible]:rounded-2xl has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2">
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
