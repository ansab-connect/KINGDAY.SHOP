import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { publicStorageUrl } from "@/lib/storage";
import type { CatalogSnapshot, ProductReview, StoreBrand, StoreCategory, StoreProduct, StoreVariant } from "./types";

/**
 * Loads the public catalogue from Supabase and maps it to storefront types.
 * RLS returns only active products, active variants, visible categories/brands
 * and approved reviews to the anonymous client.
 */

type Raw = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  highlights: string[] | null;
  age_range: string | null;
  video_path: string | null;
  is_featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  category: { slug: string; name: string; parent: { slug: string } | null } | null;
  brand: { slug: string; name: string } | null;
  product_variants: {
    id: string; sku: string; name: string; options: Record<string, string> | null; mrp: number; price: number;
    is_default: boolean; is_active: boolean; position: number; inventory: { on_hand: number; reserved: number } | null;
  }[];
  product_images: { storage_path: string; alt: string; position: number }[];
  product_attributes: { name: string; value: string; position: number }[];
};

const NEW_ARRIVAL_COUNT = 8;

export async function loadSupabaseCatalog(): Promise<CatalogSnapshot> {
  const supabase = createPublicClient();

  const [productsRes, categoriesRes, brandsRes, reviewsRes] = await Promise.all([
    supabase
      .from("products")
      .select(
        `id, name, slug, short_description, description, highlights, age_range, video_path, is_featured,
         seo_title, seo_description, published_at, created_at,
         category:categories(slug, name, parent:categories!categories_parent_id_fkey(slug)),
         brand:brands(slug, name),
         product_variants(id, sku, name, options, mrp, price, is_default, is_active, position, inventory(on_hand, reserved)),
         product_images(storage_path, alt, position),
         product_attributes(name, value, position)`,
      )
      .eq("status", "active")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(1000),
    supabase
      .from("categories")
      .select("slug, name, description, image_path, seo_title, seo_description, sort_order, parent:categories!categories_parent_id_fkey(slug)")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("brands").select("slug, name, description, logo_path").eq("is_active", true).order("name"),
    supabase
      .from("reviews")
      .select("id, rating, title, body, author_name, created_at, product:products(slug)")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  for (const r of [productsRes, categoriesRes, brandsRes, reviewsRes]) {
    if (r.error) throw new Error(`Catalogue load failed: ${r.error.message}`);
  }

  const reviews: ProductReview[] = ((reviewsRes.data ?? []) as unknown as {
    id: string; rating: number; title: string | null; body: string | null; author_name: string | null; created_at: string; product: { slug: string } | null;
  }[])
    .filter((r) => r.product)
    .map((r) => ({
      id: r.id,
      productSlug: r.product!.slug,
      author: r.author_name || "Verified customer",
      city: null,
      rating: r.rating,
      title: r.title ?? "",
      body: r.body ?? "",
      date: new Date(r.created_at),
    }));

  const ratingBySlug = new Map<string, { sum: number; count: number }>();
  for (const r of reviews) {
    const agg = ratingBySlug.get(r.productSlug) ?? { sum: 0, count: 0 };
    agg.sum += r.rating;
    agg.count += 1;
    ratingBySlug.set(r.productSlug, agg);
  }

  const raws = (productsRes.data ?? []) as unknown as Raw[];
  const products: StoreProduct[] = raws
    .filter((p) => p.category && p.product_variants.some((v) => v.is_active))
    .map((p, index) => {
      const variants: StoreVariant[] = [...p.product_variants]
        .filter((v) => v.is_active)
        .sort((a, b) => a.position - b.position)
        .map((v) => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          mrp: v.mrp,
          price: v.price,
          stock: Math.max(0, (v.inventory?.on_hand ?? 0) - (v.inventory?.reserved ?? 0)),
          colour: v.options?.colour ?? null,
        }));
      const def = variants.find((v) => p.product_variants.find((x) => x.id === v.id)?.is_default) ?? variants[0];
      const agg = ratingBySlug.get(p.slug);
      const images = [...p.product_images]
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ src: publicStorageUrl("product-images", i.storage_path)!, alt: i.alt || p.name }))
        .filter((i) => i.src);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        sku: def.sku,
        category: { slug: p.category!.slug, name: p.category!.name, parentSlug: p.category!.parent?.slug ?? null },
        brand: p.brand ? { slug: p.brand.slug, name: p.brand.name } : null,
        mrp: def.mrp,
        price: def.price,
        stock: variants.reduce((s, v) => s + v.stock, 0),
        variants,
        defaultVariantId: def.id,
        rating: agg ? Math.round((agg.sum / agg.count) * 10) / 10 : 0,
        reviewCount: agg?.count ?? 0,
        ageRange: p.age_range,
        shortDescription: p.short_description ?? "",
        description: (p.description ?? "").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
        highlights: p.highlights ?? [],
        specs: [
          ...(p.age_range ? [{ label: "Recommended age", value: p.age_range }] : []),
          ...[...p.product_attributes].sort((a, b) => a.position - b.position).map((a) => ({ label: a.name, value: a.value })),
        ],
        images,
        video: publicStorageUrl("product-videos", p.video_path),
        seoTitle: p.seo_title,
        seoDescription: p.seo_description,
        isNew: index < NEW_ARRIVAL_COUNT,
        // Bestsellers come from sales analytics in Phase 10; until then, featured items stand in.
        isBestseller: false,
        isFeatured: p.is_featured,
        addedRank: raws.length - index,
      } satisfies StoreProduct;
    });

  const countFor = (slug: string) =>
    products.filter((p) => p.category.slug === slug || p.category.parentSlug === slug).length;

  const categories: StoreCategory[] = ((categoriesRes.data ?? []) as unknown as {
    slug: string; name: string; description: string | null; image_path: string | null; seo_title: string | null; seo_description: string | null; parent: { slug: string } | null;
  }[]).map((c) => ({
    slug: c.slug,
    name: c.name,
    parentSlug: c.parent?.slug ?? null,
    description: c.description ?? "",
    imageUrl: publicStorageUrl("category-images", c.image_path),
    seoTitle: c.seo_title,
    seoDescription: c.seo_description,
    productCount: countFor(c.slug),
  }));

  const brands: StoreBrand[] = ((brandsRes.data ?? []) as unknown as { slug: string; name: string; description: string | null; logo_path: string | null }[]).map((b) => ({
    slug: b.slug,
    name: b.name,
    description: b.description ?? "",
    logoUrl: publicStorageUrl("brand-logos", b.logo_path),
    productCount: products.filter((p) => p.brand?.slug === b.slug).length,
  }));

  return { products, categories, brands, reviews, source: "supabase" };
}
