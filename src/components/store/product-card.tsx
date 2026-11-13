import Link from "next/link";
import { Price, Rating } from "@/components/store/price";
import { ProductVisual } from "@/components/store/product-visual";
import type { StoreProduct } from "@/features/catalog/types";
import { discountPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProductCard({ product, priority = false }: { product: StoreProduct; priority?: boolean }) {
  const off = discountPercent(product.mrp, product.price);
  const out = product.stock <= 0;
  return (
    <article className="group relative flex flex-col">
      <div className="relative">
        <ProductVisual
          image={product.images[0]}
          categorySlug={product.category.slug}
          priority={priority}
          className="aspect-square rounded-2xl ring-1 ring-border/70 transition-shadow duration-500 ease-royal group-hover:shadow-lift"
          iconClassName="transition-transform duration-500 ease-royal group-hover:scale-110"
        />
        <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {product.isNew ? <Tag className="bg-royal text-white">New</Tag> : null}
          {product.isBestseller ? <Tag className="bg-deep text-gold">Bestseller</Tag> : null}
        </div>
        {off >= 10 ? (
          <Tag className="pointer-events-none absolute top-3 right-3 bg-gold text-deep">-{off}%</Tag>
        ) : null}
        {out ? (
          <span className="absolute inset-x-3 bottom-3 rounded-lg bg-white/90 py-1.5 text-center text-xs font-semibold text-deep backdrop-blur">
            Out of stock
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-1.5 px-0.5">
        <p className="text-[0.7rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{product.brand?.name ?? product.category.name}</p>
        <h3 className="line-clamp-2 font-heading text-[0.95rem] leading-snug font-semibold text-deep">
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {product.name}
          </Link>
        </h3>
        <Rating value={product.rating} count={product.reviewCount} />
        <Price price={product.price} mrp={product.mrp} className="mt-auto pt-1" />
      </div>
    </article>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-bold tracking-wide shadow-sm", className)}>
      {children}
    </span>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: StoreProduct[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id} className="has-[a:focus-visible]:rounded-2xl has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-4">
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
