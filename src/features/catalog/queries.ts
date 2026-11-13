import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { discountPercent } from "@/lib/format";
import { CATALOG_TAG } from "./cache-tags";
import { previewSnapshot } from "./preview-catalog";
import { loadSupabaseCatalog } from "./supabase-catalog";
import { SORT_OPTIONS, type CatalogSnapshot, type ProductFilters, type SortOption, type StoreProduct } from "./types";

/**
 * Storefront catalogue queries.
 *
 * The catalogue is loaded once into a cached snapshot (Supabase when configured,
 * otherwise the preview catalogue) tagged "catalog". Admin saves call
 * updateTag("catalog"), so the store refreshes immediately after a change.
 * Filtering happens in memory, which is fast for a catalogue of hundreds of products;
 * move it into SQL if the catalogue grows into the thousands.
 * Prices shown here are for display only: checkout re-reads them in the database.
 */

export const PAGE_SIZE = 12;

async function getCatalog(): Promise<CatalogSnapshot> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("hours");
  return isSupabaseConfigured ? loadSupabaseCatalog() : previewSnapshot;
}

const discountOf = (p: StoreProduct) => discountPercent(p.mrp, p.price);

function sortProducts(list: StoreProduct[], sort: SortOption): StoreProduct[] {
  const out = [...list];
  switch (sort) {
    case "newest":
      return out.sort((a, b) => b.addedRank - a.addedRank);
    case "price-asc":
      return out.sort((a, b) => a.price - b.price);
    case "price-desc":
      return out.sort((a, b) => b.price - a.price);
    case "discount":
      return out.sort((a, b) => discountOf(b) - discountOf(a));
    case "rating":
      return out.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    default:
      return out.sort(
        (a, b) =>
          Number(b.isFeatured) - Number(a.isFeatured) ||
          Number(b.isBestseller) - Number(a.isBestseller) ||
          b.addedRank - a.addedRank,
      );
  }
}

const inCategory = (p: StoreProduct, slug: string) => p.category.slug === slug || p.category.parentSlug === slug;

export async function getProducts(filters: ProductFilters = {}) {
  const { products } = await getCatalog();
  const q = filters.q?.trim().toLowerCase();
  const filtered = products.filter((p) => {
    if (filters.category && !inCategory(p, filters.category)) return false;
    if (filters.brands?.length && !(p.brand && filters.brands.includes(p.brand.slug))) return false;
    if (filters.minPrice !== undefined && p.price < filters.minPrice * 100) return false;
    if (filters.maxPrice !== undefined && p.price > filters.maxPrice * 100) return false;
    if (filters.inStock && p.stock <= 0) return false;
    if (filters.onOffer && discountOf(p) < 15) return false;
    if (q) {
      const haystack = `${p.name} ${p.category.name} ${p.brand?.name ?? ""} ${p.variants.map((v) => `${v.sku} ${v.name}`).join(" ")}`;
      if (!haystack.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const sorted = sortProducts(filtered, filters.sort ?? "featured");
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  return { items: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: sorted.length, page, pageCount };
}

export async function getAllProducts() {
  return (await getCatalog()).products;
}

export async function getProductBySlug(slug: string) {
  return (await getCatalog()).products.find((p) => p.slug === slug) ?? null;
}

export async function getBestsellers(limit = 8) {
  const { products } = await getCatalog();
  const best = products.filter((p) => p.isBestseller);
  const list = best.length ? best : products.filter((p) => p.isFeatured);
  return (list.length ? list : products).slice(0, limit);
}

export async function getNewArrivals(limit = 8) {
  const { products } = await getCatalog();
  return sortProducts(products.filter((p) => p.isNew), "newest").slice(0, limit);
}

export async function getOfferProducts(limit = 8) {
  const { products } = await getCatalog();
  return sortProducts(products.filter((p) => discountOf(p) >= 15), "discount").slice(0, limit);
}

export async function getRelatedProducts(product: StoreProduct, limit = 4) {
  const { products } = await getCatalog();
  const same = products.filter((p) => p.id !== product.id && p.category.slug === product.category.slug);
  const others = products.filter((p) => p.id !== product.id && p.category.slug !== product.category.slug);
  return [...same, ...others].slice(0, limit);
}

/** Top-level categories (for navigation and listings). */
export async function getCategories() {
  return (await getCatalog()).categories.filter((c) => !c.parentSlug);
}

export async function getCategoryBySlug(slug: string) {
  return (await getCatalog()).categories.find((c) => c.slug === slug) ?? null;
}

export async function getSubcategories(parentSlug: string) {
  return (await getCatalog()).categories.filter((c) => c.parentSlug === parentSlug);
}

export async function getAllCategories() {
  return (await getCatalog()).categories;
}

export async function getBrands() {
  return (await getCatalog()).brands;
}

export async function getReviewsForProduct(slug: string) {
  return (await getCatalog()).reviews.filter((r) => r.productSlug === slug).slice(0, 12);
}

export async function getFeaturedReviews(limit = 3) {
  const { reviews } = await getCatalog();
  const seen = new Set<string>();
  // One five-star review per product, newest first.
  return reviews
    .filter((r) => r.rating === 5 && r.body && !seen.has(r.productSlug) && seen.add(r.productSlug))
    .slice(0, limit);
}

export async function getCatalogSource() {
  return (await getCatalog()).source;
}

export async function getPriceBounds() {
  const { products } = await getCatalog();
  if (!products.length) return { min: 0, max: 0 };
  const prices = products.map((p) => p.price / 100);
  return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
}

/** Parse untrusted URL search params into validated filters. */
export function parseFilters(params: Record<string, string | string[] | undefined>): ProductFilters {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const many = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v : v ? [v] : []).filter((s) => /^[a-z0-9-]{1,60}$/.test(s));
  };
  const num = (k: string) => {
    const raw = one(k);
    if (raw === undefined || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
  };
  const sortRaw = one("sort");
  const sort = SORT_OPTIONS.some((o) => o.value === sortRaw) ? (sortRaw as SortOption) : "featured";
  const category = one("category");
  return {
    q: one("q")?.slice(0, 80),
    category: category && /^[a-z0-9-]{1,60}$/.test(category) ? category : undefined,
    brands: many("brand"),
    minPrice: num("min"),
    maxPrice: num("max"),
    inStock: one("stock") === "1",
    onOffer: one("offer") === "1",
    sort,
    page: num("page") ?? 1,
  };
}
