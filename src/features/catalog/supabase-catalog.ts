import { pathIds } from "./category-tree";
import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { publicStorageUrl } from "@/lib/storage";
import { valuesFromOptions } from "./variant-types";
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
  video_link: string | null;
  is_featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  category: { slug: string; name: string; parent: { slug: string } | null } | null;
  brand: { slug: string; name: string } | null;
  option1_name: string | null;
  option2_name: string | null;
  variant_types: string[] | null;
  prepaid_discount_pct: number | string | null;
  cod_discount_pct: number | string | null;
  product_variants: {
    id: string; sku: string; name: string; options: Record<string, string> | null; mrp: number; price: number;
    option1: string | null; option2: string | null; specs: { name: string; value: string }[] | null;
    is_default: boolean; is_active: boolean; position: number; inventory: { on_hand: number; reserved: number } | null;
  }[];
  product_images: { storage_path: string; alt: string; position: number; variant_id: string | null }[];
  product_attributes: { name: string; value: string; position: number }[];
};

const NEW_ARRIVAL_COUNT = 8;

export async function loadSupabaseCatalog(): Promise<CatalogSnapshot> {
  const supabase = createPublicClient();

  const [productsRes, categoriesRes, brandsRes, reviewsRes] = await Promise.all([
    supabase
      .from("products")
      .select(
        `id, name, slug, short_description, description, highlights, age_range, video_path, video_link, is_featured,
         seo_title, seo_description, published_at, created_at, option1_name, option2_name, variant_types, prepaid_discount_pct, cod_discount_pct,
         category:categories(slug, name, parent:parent_id(slug)),
         brand:brands(slug, name),
         product_variants(id, sku, name, options, option1, option2, specs, mrp, price, is_default, is_active, position, inventory(on_hand, reserved)),
         product_images(storage_path, alt, position, variant_id),
         product_attributes(name, value, position)`,
      )
      .eq("status", "active")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(1000),
    supabase
      .from("categories")
      .select("slug, name, description, image_path, seo_title, seo_description, sort_order, parent:parent_id(slug)")
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
      const toImage = (i: { storage_path: string; alt: string }) => ({ src: publicStorageUrl("product-images", i.storage_path)!, alt: i.alt || p.name });
      const sortedImages = [...p.product_images].sort((a, b) => a.position - b.position);
      const types = p.variant_types?.length ? p.variant_types : [p.option1_name, p.option1_name ? p.option2_name : null].filter((t): t is string => Boolean(t));
      const imagesFor = (variantId: string | null) => sortedImages.filter((i) => (i.variant_id ?? null) === variantId).map(toImage).filter((i) => i.src);
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
          option1: p.option1_name ? v.option1 : null,
          option2: p.option1_name && p.option2_name ? v.option2 : null,
          images: imagesFor(v.id),
          specs: (v.specs ?? []).map((sp) => ({ label: sp.name, value: sp.value })),
          values: valuesFromOptions(types, v.options),
        }));
      const def = variants.find((v) => p.product_variants.find((x) => x.id === v.id)?.is_default) ?? variants[0];
      const agg = ratingBySlug.get(p.slug);
      const sharedImages = imagesFor(null);
      const images = sharedImages.length ? sharedImages : def.images;
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
        option1Name: p.option1_name,
        option2Name: p.option1_name ? p.option2_name : null,
        variantTypes: types,
        prepaidDiscountPct: Number(p.prepaid_discount_pct) || 0,
        codDiscountPct: Number(p.cod_discount_pct) || 0,
        sharedImages,
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
        videoLink: p.video_link,
        seoTitle: p.seo_title,
        seoDescription: p.seo_description,
        isNew: index < NEW_ARRIVAL_COUNT,
        // Bestsellers come from sales analytics in Phase 10; until then, featured items stand in.
        isBestseller: false,
        isFeatured: p.is_featured,
        addedRank: raws.length - index,
      } satisfies StoreProduct;
    });

  type RawCategory = {
    slug: string; name: string; description: string | null; image_path: string | null; seo_title: string | null; seo_description: string | null; parent: { slug: string } | null;
  };
  const rawCategories = (categoriesRes.data ?? []) as unknown as RawCategory[];
  // Categories nest to any depth: every product carries its full path, so it also shows
  // (and is counted) under each category above it.
  const tree = rawCategories.map((c) => ({ id: c.slug, parentId: c.parent?.slug ?? null }));
  for (const p of products) p.category.path = pathIds([...tree, ...(tree.some((t) => t.id === p.category.slug) ? [] : [{ id: p.category.slug, parentId: p.category.parentSlug }])], p.category.slug);
  const countFor = (slug: string) => products.filter((p) => (p.category.path ?? [p.category.slug]).includes(slug)).length;

  const categories: StoreCategory[] = rawCategories.map((c) => ({
    slug: c.slug,
    name: c.name,
    parentSlug: c.parent?.slug ?? null,
    path: pathIds(tree, c.slug),
    depth: pathIds(tree, c.slug).length - 1,
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
