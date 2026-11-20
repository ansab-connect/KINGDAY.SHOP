import "server-only";
import { createClient } from "@/lib/supabase/server";
import { publicStorageUrl } from "@/lib/storage";

/**
 * Admin catalogue reads. Uses the signed-in user's session, so RLS decides what
 * is visible (staff see drafts and inactive items; nobody else reaches these pages).
 * Callers must already have passed <StaffOnly> / assertStaff().
 */

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
  seo_title: string | null;
  seo_description: string | null;
  product_count: number;
};

export type AdminBrand = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_path: string | null;
  logo_url: string | null;
  is_active: boolean;
  product_count: number;
};

export type AdminVariant = {
  id: string;
  sku: string;
  name: string;
  options: Record<string, string>;
  option1: string | null;
  option2: string | null;
  specs: { name: string; value: string }[];
  mrp: number;
  price: number;
  weight_grams: number | null;
  is_default: boolean;
  is_active: boolean;
  on_hand: number;
  reserved: number;
};

export type AdminProductImage = { id: string; storage_path: string; url: string | null; alt: string; position: number; variant_id: string | null };

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  brand_id: string | null;
  short_description: string | null;
  description: string | null;
  highlights: string[];
  age_range: string | null;
  video_path: string | null;
  video_url: string | null;
  status: "draft" | "active" | "archived";
  is_featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  option1_name: string | null;
  option2_name: string | null;
  /** Ordered variant types; the first is the main type. */
  variant_types: string[];
  variants: AdminVariant[];
  attributes: { name: string; value: string }[];
  images: AdminProductImage[];
};

export type AdminProductRow = {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "active" | "archived";
  is_featured: boolean;
  category: string | null;
  brand: string | null;
  sku: string | null;
  variant_count: number;
  mrp: number | null;
  price: number | null;
  stock: number;
  image_url: string | null;
  updated_at: string;
};

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

export async function listCategories(): Promise<AdminCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, description, image_path, sort_order, is_active, seo_title, seo_description, products(count)")
    .order("sort_order")
    .order("name");
  if (error) fail("Loading categories", error);
  return (data ?? []).map((c) => ({
    ...c,
    product_count: (c.products as unknown as { count: number }[])?.[0]?.count ?? 0,
  })) as AdminCategory[];
}

/** Reusable variant type names (Size, Colour, …) for the product editor. */
export async function listVariantOptionTypes(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("variant_option_types").select("name, position").order("position").order("name");
  return ((data ?? []) as { name: string }[]).map((t) => t.name);
}

export async function listBrands(): Promise<AdminBrand[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, slug, description, logo_path, is_active, products(count)")
    .order("name");
  if (error) fail("Loading brands", error);
  return (data ?? []).map((b) => ({
    ...b,
    logo_url: publicStorageUrl("brand-logos", b.logo_path as string | null),
    product_count: (b.products as unknown as { count: number }[])?.[0]?.count ?? 0,
  })) as AdminBrand[];
}

export async function listProducts(filters: { q?: string; status?: string } = {}): Promise<AdminProductRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select(
      `id, name, slug, status, is_featured, updated_at,
       category:categories(name), brand:brands(name),
       product_variants(sku, mrp, price, is_default, is_active, inventory(on_hand, reserved)),
       product_images(storage_path, position)`,
    )
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filters.status && ["draft", "active", "archived"].includes(filters.status)) query = query.eq("status", filters.status);
  if (filters.q) {
    const q = filters.q.replace(/[%_,()]/g, " ").trim().slice(0, 80);
    if (q) query = query.ilike("name", `%${q}%`);
  }
  const { data, error } = await query;
  if (error) fail("Loading products", error);

  type Raw = {
    id: string; name: string; slug: string; status: AdminProductRow["status"]; is_featured: boolean; updated_at: string;
    category: { name: string } | null; brand: { name: string } | null;
    product_variants: { sku: string; mrp: number; price: number; is_default: boolean; is_active: boolean; inventory: { on_hand: number; reserved: number } | null }[];
    product_images: { storage_path: string; position: number }[];
  };
  return ((data ?? []) as unknown as Raw[]).map((p) => {
    const active = p.product_variants.filter((v) => v.is_active);
    const def = p.product_variants.find((v) => v.is_default) ?? active[0] ?? p.product_variants[0];
    const firstImage = [...p.product_images].sort((a, b) => a.position - b.position)[0];
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      is_featured: p.is_featured,
      category: p.category?.name ?? null,
      brand: p.brand?.name ?? null,
      sku: def?.sku ?? null,
      variant_count: active.length,
      mrp: def?.mrp ?? null,
      price: def?.price ?? null,
      stock: active.reduce((s, v) => s + Math.max(0, (v.inventory?.on_hand ?? 0) - (v.inventory?.reserved ?? 0)), 0),
      image_url: publicStorageUrl("product-images", firstImage?.storage_path),
      updated_at: p.updated_at,
    };
  });
}

export async function getProductForEdit(id: string): Promise<AdminProduct | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, name, slug, category_id, brand_id, short_description, description, highlights, age_range, video_path,
       status, is_featured, seo_title, seo_description, option1_name, option2_name, variant_types,
       product_variants(id, sku, name, options, option1, option2, specs, mrp, price, weight_grams, is_default, is_active, position, inventory(on_hand, reserved)),
       product_attributes(name, value, position),
       product_images(id, storage_path, alt, position, variant_id)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) fail("Loading product", error);
  if (!data) return null;

  type RawVariant = Omit<AdminVariant, "on_hand" | "reserved"> & { position: number; inventory: { on_hand: number; reserved: number } | null };
  const d = data as unknown as Omit<AdminProduct, "variants" | "attributes" | "images" | "video_url"> & {
    product_variants: RawVariant[];
    product_attributes: { name: string; value: string; position: number }[];
    product_images: { id: string; storage_path: string; alt: string; position: number; variant_id: string | null }[];
  };

  return {
    ...d,
    video_url: publicStorageUrl("product-videos", d.video_path),
    variants: [...d.product_variants]
      .sort((a, b) => a.position - b.position)
      .map((raw) => {
        const { inventory, ...rest } = raw;
        const v: AdminVariant & { position?: number } = { ...rest, on_hand: inventory?.on_hand ?? 0, reserved: inventory?.reserved ?? 0 };
        delete v.position;
        return v;
      }),
    attributes: [...d.product_attributes].sort((a, b) => a.position - b.position).map(({ name, value }) => ({ name, value })),
    images: [...d.product_images]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ ...i, url: publicStorageUrl("product-images", i.storage_path) })),
  };
}

export async function getCategory(id: string): Promise<AdminCategory | null> {
  const all = await listCategories();
  return all.find((c) => c.id === id) ?? null;
}

export async function getBrand(id: string): Promise<AdminBrand | null> {
  const all = await listBrands();
  return all.find((b) => b.id === id) ?? null;
}
