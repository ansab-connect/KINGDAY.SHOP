import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { buildBicycleTree, type BicycleTree, type FitRow, type ProductFit } from "./bicycles";
import { CATALOG_TAG } from "./cache-tags";
import { getAllCategories, getAllProducts } from "./queries";

type BicycleData = { rows: (FitRow & { slug: string })[]; fits: [string, ProductFit][] };

/** Fit ranges for the bicycle finder, cached with the catalogue (admin saves refresh it). */
async function loadBicycleData(): Promise<BicycleData> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("hours");
  if (!isSupabaseConfigured) return { rows: [], fits: [] };
  const supabase = createPublicClient();
  const [fitsRes, productFitsRes] = await Promise.all([
    supabase
      .from("bicycle_fits")
      .select("category_id, kind, wheel_size_inch, age_min, age_max, height_min_cm, height_max_cm, age_label, model_based, audience, category:categories(slug)"),
    supabase.from("product_bicycle_fits").select("product_id, age_min, age_max, height_min_cm, height_max_cm, note"),
  ]);
  // Before migration 0036 is applied the tables don't exist: the store simply shows no finder.
  if (fitsRes.error || productFitsRes.error) return { rows: [], fits: [] };
  const rows = (fitsRes.data as unknown as (FitRow & { category: { slug: string } | null })[])
    .filter((r) => r.category)
    .map(({ category, ...r }) => ({ ...r, slug: category!.slug }));
  const fits = (productFitsRes.data as { product_id: string; age_min: number | null; age_max: number | null; height_min_cm: number | null; height_max_cm: number | null; note: string | null }[]).map(
    (f) => [f.product_id, { ageMin: f.age_min, ageMax: f.age_max, heightMin: f.height_min_cm, heightMax: f.height_max_cm, note: f.note }] as [string, ProductFit],
  );
  return { rows, fits };
}

export async function getBicycleTree(): Promise<BicycleTree> {
  const [{ rows }, categories] = await Promise.all([loadBicycleData(), getAllCategories()]);
  return buildBicycleTree(rows, categories);
}

export async function getBicycleFinderData() {
  const [{ rows, fits }, categories, products] = await Promise.all([loadBicycleData(), getAllCategories(), getAllProducts()]);
  return { tree: buildBicycleTree(rows, categories), fits: new Map(fits), products };
}
