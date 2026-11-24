import { productCategorySlugs, type StoreCategory, type StoreProduct } from "./types";

/**
 * "Find Your Perfect Bicycle": bicycle types › wheel sizes, each size with an age
 * and height range (table bicycle_fits), plus optional per-model ranges
 * (table product_bicycle_fits, used for electric bicycles). Pure logic, no I/O.
 */

export type FitRange = { ageMin: number | null; ageMax: number | null; heightMin: number | null; heightMax: number | null };

export type BicycleSize = FitRange & {
  slug: string;
  name: string;
  typeSlug: string;
  inch: number;
  ageLabel: string | null;
  modelBased: boolean;
  productCount: number;
};

export type BicycleType = {
  slug: string;
  name: string;
  description: string;
  audience: "any" | "kids" | "junior" | "men" | "women";
  productCount: number;
  sizes: BicycleSize[];
};

export type BicycleTree = { root: { slug: string; name: string } | null; types: BicycleType[] };

export type ProductFit = FitRange & { note: string | null };

export type FitRow = {
  category_id: string;
  kind: "root" | "type" | "size";
  wheel_size_inch: number | string | null;
  age_min: number | null;
  age_max: number | null;
  height_min_cm: number | null;
  height_max_cm: number | null;
  age_label: string | null;
  model_based: boolean;
  audience: BicycleType["audience"];
};

/** Builds the tree from fit rows and the (active, public) categories. Inactive categories drop out. */
export function buildBicycleTree(rows: (FitRow & { slug: string })[], categories: StoreCategory[]): BicycleTree {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const rootRow = rows.find((r) => r.kind === "root" && bySlug.has(r.slug));
  if (!rootRow) return { root: null, types: [] };
  const root = bySlug.get(rootRow.slug)!;
  const order = new Map(categories.map((c, i) => [c.slug, i]));
  const types: BicycleType[] = rows
    .filter((r) => r.kind === "type" && bySlug.get(r.slug)?.parentSlug === root.slug)
    .map((r) => {
      const c = bySlug.get(r.slug)!;
      return {
        slug: c.slug,
        name: c.name,
        description: c.description,
        audience: r.audience,
        productCount: c.productCount,
        sizes: rows
          .filter((s) => s.kind === "size" && bySlug.get(s.slug)?.parentSlug === c.slug)
          .map((s) => {
            const sc = bySlug.get(s.slug)!;
            return {
              slug: sc.slug,
              name: sc.name,
              typeSlug: c.slug,
              inch: Number(s.wheel_size_inch),
              ageMin: s.age_min,
              ageMax: s.age_max,
              heightMin: s.height_min_cm,
              heightMax: s.height_max_cm,
              ageLabel: s.age_label,
              modelBased: s.model_based,
              productCount: sc.productCount,
            };
          })
          .sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0) || a.inch - b.inch),
      };
    })
    .sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
  return { root: { slug: root.slug, name: root.name }, types };
}

export const isBicycleCategory = (tree: BicycleTree, category: Pick<StoreCategory, "path" | "slug">) =>
  Boolean(tree.root && (category.path ?? [category.slug]).includes(tree.root.slug));

export const inchLabel = (inch: number) => `${Number.isInteger(inch) ? inch : inch.toFixed(1)} Inch`;

export function ageText(r: FitRange): string | null {
  if (r.ageMin == null && r.ageMax == null) return null;
  if (r.ageMax == null) return `${r.ageMin}+ years`;
  if (r.ageMin == null) return `Up to ${r.ageMax} years`;
  return r.ageMin === r.ageMax ? `${r.ageMin} years` : `${r.ageMin}–${r.ageMax} years`;
}

export function heightText(r: FitRange): string | null {
  if (r.heightMin == null && r.heightMax == null) return null;
  if (r.heightMax == null) return `${r.heightMin} cm and taller`;
  if (r.heightMin == null) return `Up to ${r.heightMax} cm`;
  return `${r.heightMin}–${r.heightMax} cm`;
}

export type FinderQuery = { type: string; age: number; height: number | null; gender: string | null };

export type FinderResult = {
  product: StoreProduct;
  size: BicycleSize | null;
  fit: FitRange;
  /** Model-specific range (overrides the size's). */
  modelSpecific: boolean;
  note: string | null;
  /** 0 = fits exactly; higher = further away (years, plus height in 10 cm steps). */
  distance: number;
};

const gap = (v: number, min: number | null, max: number | null) =>
  min != null && v < min ? min - v : max != null && v > max ? v - max : 0;

function distanceOf(fit: FitRange, q: FinderQuery): number | null {
  if (fit.ageMin == null && fit.ageMax == null && fit.heightMin == null && fit.heightMax == null) return null;
  const a = gap(q.age, fit.ageMin, fit.ageMax);
  const h = q.height == null ? 0 : gap(q.height, fit.heightMin, fit.heightMax) / 10;
  return a + h;
}

/** Reads ?type=&age=&height=&gender= into a query; null when type or age is missing/invalid. */
export function parseFinder(params: Record<string, string | string[] | undefined>, tree: BicycleTree): FinderQuery | null {
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || "";
  };
  const type = one("type");
  const age = Number(one("age"));
  const heightRaw = one("height");
  const height = heightRaw ? Number(heightRaw) : null;
  if (!tree.types.some((t) => t.slug === type)) return null;
  if (!Number.isFinite(age) || age < 1 || age > 99) return null;
  const gender = ["boy", "girl", "male", "female"].includes(one("gender")) ? one("gender") : null;
  return { type, age: Math.round(age), height: height != null && Number.isFinite(height) && height >= 50 && height <= 230 ? Math.round(height) : null, gender };
}

/**
 * Matches active products of the chosen type by age (and height, when given).
 * Model-specific ranges win over the wheel size's range. Gender never filters.
 * exact: fits; nearby: closest other bicycles of that type when nothing fits.
 */
export function findBicycles(tree: BicycleTree, products: StoreProduct[], fits: Map<string, ProductFit>, q: FinderQuery) {
  const type = tree.types.find((t) => t.slug === q.type);
  if (!type) return { type: null, exact: [], nearby: [], unrated: [], otherTypes: [] as BicycleType[] };
  const sizeBySlug = new Map(type.sizes.map((s) => [s.slug, s]));
  const scored: FinderResult[] = [];
  const unrated: FinderResult[] = [];
  for (const p of products) {
    const slugs = productCategorySlugs(p);
    if (!slugs.includes(type.slug)) continue;
    // A model listed in several sizes (24″, 26″, 27.5″) is matched on whichever size fits best.
    const sizes = slugs.map((s) => sizeBySlug.get(s)).filter((s): s is BicycleSize => Boolean(s));
    const size = sizes.length > 1 ? [...sizes].sort((a, b) => (distanceOf(a, q) ?? Infinity) - (distanceOf(b, q) ?? Infinity))[0] : sizes[0] ?? null;
    const own = fits.get(p.id);
    const hasOwn = Boolean(own && (own.ageMin != null || own.ageMax != null || own.heightMin != null || own.heightMax != null));
    const fit: FitRange = hasOwn ? own! : size ?? { ageMin: null, ageMax: null, heightMin: null, heightMax: null };
    const d = distanceOf(fit, q);
    const r = { product: p, size, fit, modelSpecific: hasOwn, note: own?.note ?? null, distance: d ?? Infinity };
    (d == null ? unrated : scored).push(r);
  }
  const bySize = (a: FinderResult, b: FinderResult) =>
    a.distance - b.distance || (a.size?.inch ?? 0) - (b.size?.inch ?? 0) || Number(b.product.stock > 0) - Number(a.product.stock > 0);
  const exact = scored.filter((r) => r.distance === 0).sort(bySize);
  const nearby = exact.length ? [] : scored.filter((r) => r.distance > 0).sort(bySize).slice(0, 8);
  // Other types whose sizes suit this age (e.g. a 30-year-old searching Kids Bicycles).
  const otherTypes = exact.length
    ? []
    : tree.types.filter((t) => t.slug !== type.slug && t.sizes.some((s) => !s.modelBased && gap(q.age, s.ageMin, s.ageMax) === 0));
  return { type, exact, nearby, unrated: exact.length ? [] : unrated, otherTypes };
}

/** Wheel sizes of a type that suit the age/height (for "try these sizes" hints). */
export function suitableSizes(type: BicycleType, q: Pick<FinderQuery, "age" | "height">) {
  return type.sizes.filter((s) => distanceOf(s, { ...q, type: type.slug, gender: null }) === 0);
}
