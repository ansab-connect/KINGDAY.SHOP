import "server-only";
import { discountPercent } from "@/lib/format";
import {
  previewCatalog,
  previewReviews,
  previewStoreBrands,
  previewStoreCategories,
} from "./preview-catalog";
import { SORT_OPTIONS, type ProductFilters, type SortOption, type StoreProduct } from "./types";

/**
 * Storefront catalogue queries. The signatures are the contract the UI depends on.
 * In Phase 5 the bodies switch from preview data to Supabase (with prices always
 * read from the database, never from the client).
 */

export const PAGE_SIZE = 12;

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
      return out.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || Number(b.isBestseller) - Number(a.isBestseller));
  }
}

export function getProducts(filters: ProductFilters = {}) {
  const q = filters.q?.trim().toLowerCase();
  const filtered = previewCatalog.filter((p) => {
    if (filters.category && p.category.slug !== filters.category) return false;
    if (filters.brands?.length && !filters.brands.includes(p.brand.slug)) return false;
    if (filters.minPrice !== undefined && p.price < filters.minPrice * 100) return false;
    if (filters.maxPrice !== undefined && p.price > filters.maxPrice * 100) return false;
    if (filters.inStock && p.stock <= 0) return false;
    if (filters.onOffer && discountOf(p) < 15) return false;
    if (q && !`${p.name} ${p.category.name} ${p.brand.name} ${p.sku}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const sorted = sortProducts(filtered, filters.sort ?? "featured");
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  return {
    items: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: sorted.length,
    page,
    pageCount,
  };
}

export function getAllProducts() {
  return previewCatalog;
}

export function getProductBySlug(slug: string) {
  return previewCatalog.find((p) => p.slug === slug) ?? null;
}

export function getBestsellers(limit = 8) {
  return previewCatalog.filter((p) => p.isBestseller).slice(0, limit);
}

export function getNewArrivals(limit = 8) {
  return sortProducts(previewCatalog.filter((p) => p.isNew), "newest").slice(0, limit);
}

export function getOfferProducts(limit = 8) {
  return sortProducts(previewCatalog.filter((p) => discountOf(p) >= 15), "discount").slice(0, limit);
}

export function getRelatedProducts(product: StoreProduct, limit = 4) {
  const same = previewCatalog.filter((p) => p.id !== product.id && p.category.slug === product.category.slug);
  const others = previewCatalog.filter((p) => p.id !== product.id && p.category.slug !== product.category.slug);
  return [...same, ...others].slice(0, limit);
}

export function getCategories() {
  return previewStoreCategories;
}

export function getCategoryBySlug(slug: string) {
  return previewStoreCategories.find((c) => c.slug === slug) ?? null;
}

export function getBrands() {
  return previewStoreBrands;
}

export function getReviewsForProduct(slug: string) {
  return previewReviews.filter((r) => r.productSlug === slug);
}

export function getFeaturedReviews(limit = 3) {
  return previewReviews.filter((r) => r.rating === 5).filter((_, i) => i % 5 === 0).slice(0, limit);
}

export function getPriceBounds() {
  const prices = previewCatalog.map((p) => p.price / 100);
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
    const n = Number(one(k));
    return Number.isFinite(n) && n >= 0 && one(k) !== "" && one(k) !== undefined ? Math.floor(n) : undefined;
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
