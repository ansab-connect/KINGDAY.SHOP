"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import type { Action, Module } from "@/features/auth/permissions";
import { assertCan } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { CATALOG_TAG } from "./cache-tags";
import {
  brandInputSchema,
  categoryInputSchema,
  issuesToFieldErrors,
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
  if (images?.length) {
    await supabase.storage.from("product-images").remove(images.map((i) => i.storage_path as string));
  }
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
  const { data, error } = await supabase.from("product_images").delete().eq("id", imageId).select("storage_path").maybeSingle();
  if (error) return dbError(error, "image");
  if (data?.storage_path) await supabase.storage.from("product-images").remove([data.storage_path as string]);
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
