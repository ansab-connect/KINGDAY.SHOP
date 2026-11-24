"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import type { Action, Module } from "@/features/auth/permissions";
import { assertCan } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getProductForEdit } from "./admin-repo";
import { CATALOG_TAG } from "./cache-tags";
import { valuesFromOptions } from "./variant-types";
import { GALLERY_MAX, planGallery, poolFolder, poolPaths, POOL_MAX_FILES, unusedPoolPaths } from "./image-pool";
import {
  brandInputSchema,
  categoryInputSchema,
  issuesToFieldErrors,
  paiseToRupees,
  productImagePathSchema,
  productInputSchema,
  toSaveProductPayload,
} from "./schemas";

/**
 * Catalogue management server actions.
 * Order of operations in every action: authorise → validate → write (RLS applies,
 * DB constraints re-check) → invalidate the storefront cache.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type PgError = { code?: string; message: string; details?: string | null };

function dbError(e: PgError, what: string): ActionResult<never> {
  switch (e.code) {
    case "23505": {
      if (/combination/i.test(e.message + (e.details ?? ""))) {
        return { ok: false, error: "Two active variants have the same combination (e.g. the same size and colour). Change one of them." };
      }
      const field = /sku/i.test(e.message + (e.details ?? "")) ? "SKU" : /slug/i.test(e.message + (e.details ?? "")) ? "URL slug" : "value";
      return { ok: false, error: `That ${field} is already used by another ${what}.` };
    }
    case "23503":
      return { ok: false, error: `This ${what} is still in use, so it can't be deleted. Archive or hide it instead.` };
    case "23514":
      return { ok: false, error: `Some values aren't allowed. Check prices, SKUs and limits.` };
    case "42501":
      return { ok: false, error: "You don't have permission to do that." };
    default:
      return { ok: false, error: `Couldn't save the ${what}. Please try again.` };
  }
}

const notConfigured: ActionResult<never> = {
  ok: false,
  error: "Saving is disabled until Supabase is connected (see docs/SUPABASE_SETUP.md).",
};

/** Passes when the user holds any of the given permissions on the module (RLS re-checks the exact one). */
async function guard(module: Module, actions: Action[]): Promise<ActionResult<never> | null> {
  if (!isSupabaseConfigured) return notConfigured;
  for (const action of actions) {
    try {
      await assertCan(module, action);
      return null;
    } catch {}
  }
  return { ok: false, error: "You don't have permission to do that." };
}

const idSchema = z.uuid();

/**
 * Preview mode (no Supabase): there is no data to protect, so validate the input
 * and report field errors, then explain that saving is disabled.
 */
function previewValidate(schema: z.ZodType, input: unknown): ActionResult<never> {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? notConfigured
    : { ok: false, error: "Please fix the highlighted fields.", fieldErrors: issuesToFieldErrors(parsed.error) };
}

// ---------------------------------------------------------------- Categories
export async function saveCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!isSupabaseConfigured) return previewValidate(categoryInputSchema, input);
  const denied = await guard("categories", ["create", "edit"]);
  if (denied) return denied;
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: issuesToFieldErrors(parsed.error) };

  const { id, ...values } = parsed.data;
  if (values.image_path && !/^categories\/[a-z0-9-]{8,64}\.(webp|png|jpg|jpeg|avif)$/.test(values.image_path)) {
    return { ok: false, error: "Invalid image file.", fieldErrors: { image_path: "Invalid image file." } };
  }
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("categories").update(values).eq("id", id).select("id").single()
    : await supabase.from("categories").insert(values).select("id").single();
  if (error) return dbError(error, "category");

  updateTag(CATALOG_TAG);
  return { ok: true, data: { id: data.id as string }, message: "Category saved." };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const denied = await guard("categories", ["delete"]);
  if (denied) return denied;
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid category." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("categories").delete({ count: "exact" }).eq("id", id);
  if (error) return dbError(error, "category");
  if (!count) return { ok: false, error: "Category not found or not allowed." };
  updateTag(CATALOG_TAG);
  return { ok: true, data: undefined, message: "Category deleted." };
}

// ---------------------------------------------------------------- Brands
export async function saveBrand(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!isSupabaseConfigured) return previewValidate(brandInputSchema, input);
  const denied = await guard("brands", ["create", "edit"]);
  if (denied) return denied;
  const parsed = brandInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: issuesToFieldErrors(parsed.error) };

  const { id, ...values } = parsed.data;
  if (values.logo_path && !/^brands\/[a-z0-9-]{8,64}\.(webp|png|jpg|jpeg|avif)$/.test(values.logo_path)) {
    return { ok: false, error: "Invalid logo file.", fieldErrors: { logo_path: "Invalid logo file." } };
  }
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("brands").update(values).eq("id", id).select("id").single()
    : await supabase.from("brands").insert(values).select("id").single();
  if (error) return dbError(error, "brand");

  updateTag(CATALOG_TAG);
  return { ok: true, data: { id: data.id as string }, message: "Brand saved." };
}

export async function deleteBrand(id: string): Promise<ActionResult> {
  const denied = await guard("brands", ["delete"]);
  if (denied) return denied;
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid brand." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("brands").delete({ count: "exact" }).eq("id", id);
  if (error) return dbError(error, "brand");
  if (!count) return { ok: false, error: "Brand not found or not allowed." };
  updateTag(CATALOG_TAG);
  return { ok: true, data: undefined, message: "Brand deleted." };
}

// ---------------------------------------------------------------- Products
export async function saveProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!isSupabaseConfigured) return previewValidate(productInputSchema, input);
  const denied = await guard("products", ["create", "edit"]);
  if (denied) return denied;
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: issuesToFieldErrors(parsed.error) };

  if (parsed.data.video_path && !/^products\/[0-9a-f-]{36}\/[a-z0-9-]{8,64}\.(mp4|webm)$/.test(parsed.data.video_path)) {
    return { ok: false, error: "Invalid video file." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_product", { p: toSaveProductPayload(parsed.data) });
  if (error) return dbError(error, "product");
  const { error: discountError } = await supabase
    .from("products")
    .update({ prepaid_discount_pct: parsed.data.prepaid_discount_pct, cod_discount_pct: parsed.data.cod_discount_pct, video_link: parsed.data.video_link })
    .eq("id", data as string);
  if (discountError) return dbError(discountError, "product");

  // Categories: the extra ones chosen ("Also show in") plus each variant's own category
  // (listed there with that variant's price). Keep exactly these rows.
  const productId = data as string;
  const desired = new Map<string, string | null>();
  for (const c of parsed.data.extra_category_ids) if (c !== parsed.data.category_id) desired.set(c, null);
  const linked = parsed.data.variants.filter((v) => v.category_id);
  if (linked.length) {
    const { data: saved } = await supabase.from("product_variants").select("id, sku").eq("product_id", productId);
    const idBySku = new Map(((saved ?? []) as { id: string; sku: string }[]).map((v) => [v.sku, v.id]));
    for (const v of linked) {
      const id = v.id ?? idBySku.get(v.sku);
      if (id) desired.set(v.category_id!, id);
    }
  }
  const { data: existing, error: catReadError } = await supabase.from("product_categories").select("category_id, variant_id").eq("product_id", productId);
  if (!catReadError) {
    const had = new Map(((existing ?? []) as { category_id: string; variant_id: string | null }[]).map((r) => [r.category_id, r.variant_id]));
    const remove = [...had.keys()].filter((c) => !desired.has(c));
    const upsert = [...desired].filter(([c, v]) => !had.has(c) || had.get(c) !== v).map(([category_id, variant_id]) => ({ product_id: productId, category_id, variant_id }));
    if (remove.length) {
      const { error: e } = await supabase.from("product_categories").delete().eq("product_id", productId).in("category_id", remove);
      if (e) return dbError(e, "product");
    }
    if (upsert.length) {
      const { error: e } = await supabase.from("product_categories").upsert(upsert, { onConflict: "product_id,category_id" });
      if (e) return dbError(e, "product");
    }
  } else if (desired.size) {
    return { ok: false, error: "Product saved, but categories need database updates 0037 and 0038 first." };
  }

  // Stock typed into the editor for saved variants: record the difference in the stock
  // ledger (same as an Inventory adjustment), measured against the live count.
  const targets = parsed.data.variants.filter((v) => v.id && v.stock_target !== undefined);
  let stockNote = "";
  if (targets.length) {
    const { data: inv } = await supabase.from("inventory").select("variant_id, on_hand").in("variant_id", targets.map((v) => v.id!));
    const onHand = new Map(((inv ?? []) as { variant_id: string; on_hand: number }[]).map((r) => [r.variant_id, r.on_hand]));
    let failed = 0;
    for (const v of targets) {
      const delta = v.stock_target! - (onHand.get(v.id!) ?? 0);
      if (!delta) continue;
      const { error: adjErr } = await supabase.rpc("adjust_stock", {
        p_variant_id: v.id,
        p_quantity: delta,
        p_type: "adjustment",
        p_reason: "Stock set in the product editor",
      });
      if (adjErr) failed++;
    }
    if (failed) stockNote = ` ${failed} stock change${failed === 1 ? "" : "s"} couldn't be saved (stock can't go below what's reserved for open orders).`;
  }

  updateTag(CATALOG_TAG);
  return { ok: true, data: { id: data as string }, message: `Product saved.${stockNote}` };
}

/** Active = on the store; Inactive = hidden (saved as Draft). */
export async function setProductActive(id: string, active: boolean): Promise<ActionResult> {
  const denied = await guard("products", ["edit"]);
  if (denied) return denied;
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid product." };
  const supabase = await createClient();
  const { data: current } = await supabase.from("products").select("published_at").eq("id", id).maybeSingle();
  if (!current) return { ok: false, error: "Product not found or not allowed." };
  const { error } = await supabase
    .from("products")
    .update(active ? { status: "active", published_at: current.published_at ?? new Date().toISOString() } : { status: "draft" })
    .eq("id", id);
  if (error) return dbError(error, "product");
  updateTag(CATALOG_TAG);
  return { ok: true, data: undefined, message: active ? "Product is live on the store." : "Product hidden from the store." };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const denied = await guard("products", ["delete"]);
  if (denied) return denied;
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid product." };
  const supabase = await createClient();

  const { data: images } = await supabase.from("product_images").select("storage_path").eq("product_id", id);
  const { error, count } = await supabase.from("products").delete({ count: "exact" }).eq("id", id);
  if (error) {
    return error.code === "23503"
      ? { ok: false, error: "This product has stock or order history, so it can't be deleted. Set it to Archived instead." }
      : dbError(error, "product");
  }
  if (!count) return { ok: false, error: "Product not found or not allowed." };
  // The product is gone: remove its gallery files and anything left in its temporary pool.
  const { data: poolFiles } = await supabase.storage.from("product-images").list(poolFolder(id), { limit: POOL_MAX_FILES });
  const files = [...new Set([...(images ?? []).map((i) => i.storage_path as string), ...poolPaths(id, (poolFiles ?? []).map((f) => f.name))])];
  if (files.length) await supabase.storage.from("product-images").remove(files);
  updateTag(CATALOG_TAG);
  return { ok: true, data: undefined, message: "Product deleted." };
}

// ---------------------------------------------------------------- Images
export async function addProductImage(input: {
  productId: string;
  path: string;
  alt: string;
  width?: number;
  height?: number;
  /** Gallery of one combination. Give the variant ID, or its SKU (bulk import). Empty = shared product images. */
  variantId?: string | null;
  variantSku?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const denied = await guard("products", ["create", "edit"]);
  if (denied) return denied;
  if (!idSchema.safeParse(input.productId).success) return { ok: false, error: "Invalid product." };
  if (!productImagePathSchema(input.productId).safeParse(input.path).success) return { ok: false, error: "Invalid image path." };

  const supabase = await createClient();
  let variantId: string | null = null;
  if (input.variantId || input.variantSku) {
    let q = supabase.from("product_variants").select("id").eq("product_id", input.productId);
    q = input.variantId ? q.eq("id", input.variantId) : q.eq("sku", String(input.variantSku).toUpperCase());
    const { data: v } = await q.maybeSingle();
    if (!v) return { ok: false, error: "That variant doesn't belong to this product." };
    variantId = v.id as string;
  }
  // 12 images per gallery: the shared product gallery and each combination's own gallery.
  let countQ = supabase.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", input.productId);
  countQ = variantId ? countQ.eq("variant_id", variantId) : countQ.is("variant_id", null);
  const { count } = await countQ;
  if ((count ?? 0) >= 12) return { ok: false, error: "This gallery already has 12 images." };

  const { data, error } = await supabase
    .from("product_images")
    .insert({
      product_id: input.productId,
      variant_id: variantId,
      storage_path: input.path,
      alt: String(input.alt ?? "").slice(0, 200),
      width: Number.isInteger(input.width) ? input.width : null,
      height: Number.isInteger(input.height) ? input.height : null,
      position: count ?? 0,
    })
    .select("id")
    .single();
  if (error) return dbError(error, "image");
  updateTag(CATALOG_TAG);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateProductImageAlt(imageId: string, alt: string): Promise<ActionResult> {
  const denied = await guard("products", ["create", "edit"]);
  if (denied) return denied;
  if (!idSchema.safeParse(imageId).success) return { ok: false, error: "Invalid image." };
  const supabase = await createClient();
  const { error } = await supabase.from("product_images").update({ alt: String(alt).slice(0, 200) }).eq("id", imageId);
  if (error) return dbError(error, "image");
  updateTag(CATALOG_TAG);
  return { ok: true, data: undefined };
}

export async function deleteProductImage(imageId: string): Promise<ActionResult> {
  const denied = await guard("products", ["edit"]);
  if (denied) return denied;
  if (!idSchema.safeParse(imageId).success) return { ok: false, error: "Invalid image." };
  const supabase = await createClient();
  // Removes the image from this gallery only. The file stays in the product's temporary
  // gallery (it may still be used by other variants); "Remove Unused" deletes it later.
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) return dbError(error, "image");
  updateTag(CATALOG_TAG);
  return { ok: true, data: undefined };
}

export async function reorderProductImages(productId: string, imageIds: string[]): Promise<ActionResult> {
  const denied = await guard("products", ["create", "edit"]);
  if (denied) return denied;
  const parsed = z.object({ productId: idSchema, imageIds: z.array(idSchema).max(12) }).safeParse({ productId, imageIds });
  if (!parsed.success) return { ok: false, error: "Invalid image order." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_product_images", { p_product_id: productId, p_image_ids: imageIds });
  if (error) return dbError(error, "image");
  updateTag(CATALOG_TAG);
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------- Temporary image gallery
export type PoolImage = { path: string; createdAt: string | null };

/** Every image file uploaded for the product (assigned or not). */
export async function getImagePool(productId: string): Promise<ActionResult<PoolImage[]>> {
  const denied = await guard("products", ["create", "edit"]);
  if (denied) return denied;
  if (!idSchema.safeParse(productId).success) return { ok: false, error: "Invalid product." };
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("product-images")
    .list(poolFolder(productId), { limit: POOL_MAX_FILES, sortBy: { column: "created_at", order: "asc" } });
  if (error) return { ok: false, error: "Couldn't load the temporary images." };
  const created = new Map((data ?? []).map((f) => [f.name, (f.created_at as string | null) ?? null]));
  return { ok: true, data: poolPaths(productId, (data ?? []).map((f) => f.name)).map((path) => ({ path, createdAt: created.get(path.split("/").pop()!) ?? null })) };
}

/**
 * Set a variant's images (or the shared images with variantId null) to exactly these
 * pool files, in this order. Images taken off the variant stay in the pool.
 */
export async function assignVariantImages(input: { productId: string; variantId: string | null; paths: string[]; alt: string }): Promise<ActionResult> {
  const denied = await guard("products", ["create", "edit"]);
  if (denied) return denied;
  const parsed = z
    .object({ productId: idSchema, variantId: idSchema.nullable(), paths: z.array(z.string()).max(GALLERY_MAX, `Choose at most ${GALLERY_MAX} images.`), alt: z.string().max(200) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid selection." };
  const { productId, variantId, paths, alt } = parsed.data;
  const pathOk = productImagePathSchema(productId);
  if (!paths.every((p) => pathOk.safeParse(p).success)) return { ok: false, error: "Invalid image." };

  const supabase = await createClient();
  if (variantId) {
    const { data: v } = await supabase.from("product_variants").select("id").eq("product_id", productId).eq("id", variantId).maybeSingle();
    if (!v) return { ok: false, error: "That variant doesn't belong to this product. Save the product first." };
  }
  let q = supabase.from("product_images").select("id, storage_path").eq("product_id", productId);
  q = variantId ? q.eq("variant_id", variantId) : q.is("variant_id", null);
  const { data: current, error: readErr } = await q;
  if (readErr) return dbError(readErr, "image");

  const plan = planGallery((current ?? []) as { id: string; storage_path: string }[], paths);
  if (plan.remove.length) {
    const { error } = await supabase.from("product_images").delete().in("id", plan.remove);
    if (error) return dbError(error, "image");
  }
  const newIds = new Map<string, string>();
  if (plan.add.length) {
    const { data: inserted, error } = await supabase
      .from("product_images")
      .insert(plan.add.map((storage_path, i) => ({ product_id: productId, variant_id: variantId, storage_path, alt: alt.slice(0, 200), position: 100 + i })))
      .select("id, storage_path");
    if (error) return dbError(error, "image");
    for (const r of (inserted ?? []) as { id: string; storage_path: string }[]) newIds.set(r.storage_path, r.id);
  }
  const order = plan.wanted.map((p) => plan.existingIdFor(p) ?? newIds.get(p)).filter((x): x is string => Boolean(x));
  if (order.length) {
    const { error } = await supabase.rpc("reorder_product_images", { p_product_id: productId, p_image_ids: order });
    if (error) return dbError(error, "image");
  }
  updateTag(CATALOG_TAG);
  return { ok: true, data: undefined, message: plan.wanted.length ? `${plan.wanted.length} image${plan.wanted.length === 1 ? "" : "s"} assigned.` : "Images removed from this variant." };
}

/** Delete pool files that no gallery uses. Assigned files (in any product) are never touched. */
export async function removeUnusedPoolImages(productId: string): Promise<ActionResult<{ removed: number }>> {
  const denied = await guard("products", ["edit"]);
  if (denied) return denied;
  if (!idSchema.safeParse(productId).success) return { ok: false, error: "Invalid product." };
  const supabase = await createClient();
  const { data: files, error: listErr } = await supabase.storage.from("product-images").list(poolFolder(productId), { limit: POOL_MAX_FILES });
  if (listErr) return { ok: false, error: "Couldn't load the temporary images." };
  const paths = poolPaths(productId, (files ?? []).map((f) => f.name));
  if (!paths.length) return { ok: true, data: { removed: 0 }, message: "No temporary images." };
  // Re-read usage right before deleting, across all products, so nothing assigned is removed.
  const { data: used, error: usedErr } = await supabase.from("product_images").select("storage_path").like("storage_path", `${poolFolder(productId)}/%`);
  if (usedErr) return { ok: false, error: "Couldn't check which images are in use. Nothing was deleted." };
  const doomed = unusedPoolPaths(paths, ((used ?? []) as { storage_path: string }[]).map((r) => r.storage_path));
  if (!doomed.length) return { ok: true, data: { removed: 0 }, message: "Every image is assigned. Nothing to remove." };
  const { error } = await supabase.storage.from("product-images").remove(doomed);
  if (error) return { ok: false, error: "Couldn't remove the images. Please try again." };
  return { ok: true, data: { removed: doomed.length }, message: `Removed ${doomed.length} unused image${doomed.length === 1 ? "" : "s"}.` };
}

// ---------------------------------------------------------------- Duplicate
/**
 * Copy a product into a new DRAFT: details, variants (new SKUs, stock 0), categories,
 * per-variant categories and photos (copied files, so deleting one product never
 * breaks the other). The admin edits the copy and makes it Active when ready.
 */
export async function duplicateProduct(id: string): Promise<ActionResult<{ id: string }>> {
  const denied = await guard("products", ["create"]);
  if (denied) return denied;
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid product." };
  const src = await getProductForEdit(id).catch(() => null);
  if (!src) return { ok: false, error: "Product not found." };
  const supabase = await createClient();

  // Free URL slug: name-copy, name-copy-2, …
  const baseSlug = `${src.slug}`.slice(0, 70).replace(/-+$/, "") + "-copy";
  const { data: slugRows } = await supabase.from("products").select("slug").like("slug", `${baseSlug}%`);
  const takenSlugs = new Set(((slugRows ?? []) as { slug: string }[]).map((r) => r.slug));
  let slug = baseSlug;
  for (let n = 2; takenSlugs.has(slug); n++) slug = `${baseSlug}-${n}`;

  // Free SKUs: SKU-C, SKU-C2, … (max 40 characters).
  const { data: skuRows } = await supabase.from("product_variants").select("sku").limit(20000);
  const takenSkus = new Set(((skuRows ?? []) as { sku: string }[]).map((r) => r.sku));
  const newSku = (sku: string) => {
    for (let n = 1; n < 1000; n++) {
      const tail = n === 1 ? "-C" : `-C${n}`;
      const cand = `${sku.slice(0, 40 - tail.length)}${tail}`;
      if (!takenSkus.has(cand)) {
        takenSkus.add(cand);
        return cand;
      }
    }
    return sku;
  };

  const types = src.variant_types?.length ? src.variant_types : [src.option1_name, src.option1_name ? src.option2_name : null].filter((t): t is string => Boolean(t));
  const skuMap = new Map<string, string>();
  const input = {
    name: `${src.name} (Copy)`.slice(0, 160),
    slug,
    category_id: src.category_id,
    extra_category_ids: src.extra_category_ids,
    brand_id: src.brand_id ?? "",
    short_description: src.short_description ?? "",
    description: src.description ?? "",
    highlights: src.highlights,
    age_range: src.age_range ?? "",
    video_path: src.video_path ?? "",
    video_link: src.video_link ?? "",
    status: "draft" as const,
    is_featured: false,
    prepaid_discount_pct: src.prepaid_discount_pct,
    cod_discount_pct: src.cod_discount_pct,
    seo_title: src.seo_title ?? "",
    seo_description: src.seo_description ?? "",
    variant_types: types,
    attributes: src.attributes,
    variants: src.variants.map((v) => {
      const values = valuesFromOptions(types, v.options);
      if (types[0] && !values[types[0]] && v.option1) values[types[0]] = v.option1;
      if (types[1] && !values[types[1]] && v.option2) values[types[1]] = v.option2;
      const sku = newSku(v.sku);
      skuMap.set(v.id, sku);
      const auto = types.map((t) => values[t]).filter(Boolean).join(" · ");
      return {
        sku,
        name: types.length ? (v.name === auto ? "" : v.name) : v.name,
        colour: v.options?.colour ?? "",
        values: types.length ? values : undefined,
        specs: v.specs ?? [],
        mrp: paiseToRupees(v.mrp),
        price: paiseToRupees(v.price),
        opening_stock: 0,
        is_active: v.is_active,
        is_default: v.is_default,
        category_id: v.category_id ?? "",
      };
    }),
  };
  const saved = await saveProduct(input);
  if (!saved.ok) return { ok: false, error: `Couldn't copy: ${saved.error}` };
  const newId = saved.data.id;

  // Photos: copy each file into the new product's folder and recreate its gallery rows.
  if (src.images.length) {
    const { data: newVariants } = await supabase.from("product_variants").select("id, sku").eq("product_id", newId);
    const idBySku = new Map(((newVariants ?? []) as { id: string; sku: string }[]).map((v) => [v.sku, v.id]));
    const copied = new Map<string, string>();
    const rows: { product_id: string; variant_id: string | null; storage_path: string; alt: string; position: number }[] = [];
    for (const img of src.images) {
      let to = copied.get(img.storage_path);
      if (!to) {
        const ext = img.storage_path.split(".").pop() ?? "webp";
        to = `products/${newId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("product-images").copy(img.storage_path, to);
        if (error) continue;
        copied.set(img.storage_path, to);
      }
      const variantId = img.variant_id ? (idBySku.get(skuMap.get(img.variant_id) ?? "") ?? null) : null;
      if (img.variant_id && !variantId) continue;
      rows.push({ product_id: newId, variant_id: variantId, storage_path: to, alt: img.alt, position: img.position });
    }
    if (rows.length) await supabase.from("product_images").insert(rows);
  }
  updateTag(CATALOG_TAG);
  return { ok: true, data: { id: newId }, message: "Copy created as a draft. Check the name, SKUs, stock and photos, then make it Active." };
}
