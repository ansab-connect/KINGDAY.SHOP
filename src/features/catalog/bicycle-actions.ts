"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import type { Action, Module } from "@/features/auth/permissions";
import { assertCan } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { CATALOG_TAG } from "./cache-tags";
import { slugify } from "./schemas";

/**
 * Admin → Bicycles. Types and wheel sizes are ordinary categories (so URLs, SEO and
 * listings keep working) plus a bicycle_fits row with the age/height range.
 * Nothing is deleted here: categories are deactivated. RLS re-checks every write.
 */

type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

async function guard(module: Module, actions: Action[]): Promise<Result<never> | null> {
  if (!isSupabaseConfigured) return { ok: false, error: "Saving is disabled until Supabase is connected." };
  for (const a of actions) {
    try {
      await assertCan(module, a);
      return null;
    } catch {}
  }
  return { ok: false, error: "You don't have permission to do that." };
}

const age = z.coerce.number().int().min(0).max(99).nullable();
const cm = z.coerce.number().int().min(50).max(230).nullable();
const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const n = <T extends z.ZodType>(s: T) => z.preprocess(blankToNull, s);

const typeSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(2).max(80),
  audience: z.enum(["any", "kids", "junior", "men", "women"]),
  is_active: z.boolean(),
});

const sizeSchema = z
  .object({
    id: z.uuid().nullable(),
    type_id: z.uuid(),
    inch: z.coerce.number().min(8).max(32),
    age_min: n(age),
    age_max: n(age),
    height_min_cm: n(cm),
    height_max_cm: n(cm),
    model_based: z.boolean(),
    is_active: z.boolean(),
  })
  .refine((v) => v.age_min == null || v.age_max == null || v.age_min <= v.age_max, { message: "Minimum age is above maximum age." })
  .refine((v) => v.height_min_cm == null || v.height_max_cm == null || v.height_min_cm <= v.height_max_cm, { message: "Minimum height is above maximum height." });

const fitSchema = z
  .object({
    product_id: z.uuid(),
    age_min: n(age),
    age_max: n(age),
    height_min_cm: n(cm),
    height_max_cm: n(cm),
    note: z.preprocess(blankToNull, z.string().trim().max(120).nullable()),
  })
  .refine((v) => v.age_min == null || v.age_max == null || v.age_min <= v.age_max, { message: "Minimum age is above maximum age." })
  .refine((v) => v.height_min_cm == null || v.height_max_cm == null || v.height_min_cm <= v.height_max_cm, { message: "Minimum height is above maximum height." });

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Please check the values.";
const inchText = (inch: number) => (Number.isInteger(inch) ? String(inch) : String(inch));

/** "12+ Years", "2–3 Years", or the model-based note. Shown in the category name. */
export async function sizeAgeLabel(v: { age_min: number | null; age_max: number | null; model_based: boolean }) {
  if (v.model_based || (v.age_min == null && v.age_max == null)) return "Model-based age recommendation";
  if (v.age_max == null) return `${v.age_min}+ Years`;
  if (v.age_min == null) return `Up to ${v.age_max} Years`;
  return `${v.age_min}–${v.age_max} Years`;
}

async function freeSlug(supabase: Awaited<ReturnType<typeof createClient>>, base: string, selfId: string | null) {
  for (let i = 0; i < 20; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const { data } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
    if (!data || data.id === selfId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function rootId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("bicycle_fits").select("category_id").eq("kind", "root").limit(1).maybeSingle();
  return (data?.category_id as string | undefined) ?? null;
}

export async function saveBicycleType(input: unknown): Promise<Result<{ id: string }>> {
  const denied = await guard("categories", ["create", "edit"]);
  if (denied) return denied;
  const parsed = typeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const root = await rootId(supabase);
  if (!root) return { ok: false, error: "The Bicycles category is missing. Apply migration 0036 first." };

  let id = v.id;
  if (id) {
    const { error } = await supabase.from("categories").update({ name: v.name, is_active: v.is_active }).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { count } = await supabase.from("categories").select("id", { count: "exact", head: true }).eq("parent_id", root);
    const slug = await freeSlug(supabase, slugify(v.name), null);
    const { data, error } = await supabase
      .from("categories")
      .insert({ name: v.name, slug, parent_id: root, is_active: v.is_active, sort_order: ((count ?? 0) + 1) * 10 })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    id = data.id as string;
  }
  const { error } = await supabase.from("bicycle_fits").upsert({ category_id: id, kind: "type", audience: v.audience });
  if (error) return { ok: false, error: error.message };
  updateTag(CATALOG_TAG);
  return { ok: true, data: { id: id! }, message: "Bicycle type saved." };
}

export async function saveBicycleSize(input: unknown): Promise<Result<{ id: string }>> {
  const denied = await guard("categories", ["create", "edit"]);
  if (denied) return denied;
  const parsed = sizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data: type } = await supabase.from("categories").select("id, slug").eq("id", v.type_id).maybeSingle();
  const { data: typeFit } = await supabase.from("bicycle_fits").select("kind").eq("category_id", v.type_id).maybeSingle();
  if (!type || typeFit?.kind !== "type") return { ok: false, error: "Choose a bicycle type." };

  const label = await sizeAgeLabel(v);
  const name = `${inchText(v.inch)} Inch | ${label}`;
  // Same wheel size twice in one type would show two identical categories.
  const { data: siblings } = await supabase.from("categories").select("id, bicycle_fits(wheel_size_inch, kind)").eq("parent_id", v.type_id);
  const clash = (siblings ?? []).some((s) => {
    type F = { wheel_size_inch: number | string | null; kind: string };
    const raw = s.bicycle_fits as unknown as F | F[] | null;
    const f = Array.isArray(raw) ? raw[0] : raw;
    return s.id !== v.id && f?.kind === "size" && Number(f.wheel_size_inch) === v.inch;
  });
  if (clash) return { ok: false, error: `${inchText(v.inch)} inch already exists in this type.` };

  let id = v.id;
  if (id) {
    const { error } = await supabase.from("categories").update({ name, is_active: v.is_active }).eq("id", id).eq("parent_id", v.type_id);
    if (error) return { ok: false, error: error.message };
  } else {
    const base = `${type.slug.replace(/^electric-cycles$/, "electric-bicycles")}-${inchText(v.inch).replace(".", "-")}-inch`;
    const slug = await freeSlug(supabase, base, null);
    const { data, error } = await supabase
      .from("categories")
      .insert({ name, slug, parent_id: v.type_id, is_active: v.is_active, sort_order: Math.round(v.inch * 10) })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    id = data.id as string;
  }
  const { error } = await supabase.from("bicycle_fits").upsert({
    category_id: id,
    kind: "size",
    wheel_size_inch: v.inch,
    age_min: v.model_based ? null : v.age_min,
    age_max: v.model_based ? null : v.age_max,
    age_label: label,
    height_min_cm: v.height_min_cm,
    height_max_cm: v.height_max_cm,
    model_based: v.model_based,
  });
  if (error) return { ok: false, error: error.message };
  updateTag(CATALOG_TAG);
  return { ok: true, data: { id: id! }, message: "Wheel size saved." };
}

/** Display order: the given categories (siblings) in this order. */
export async function reorderBicycleCategories(ids: string[]): Promise<Result> {
  const denied = await guard("categories", ["edit"]);
  if (denied) return denied;
  if (!z.array(z.uuid()).max(50).safeParse(ids).success) return { ok: false, error: "Invalid order." };
  const supabase = await createClient();
  const { data: fits } = await supabase.from("bicycle_fits").select("category_id").in("category_id", ids);
  if ((fits ?? []).length !== ids.length) return { ok: false, error: "Only bicycle categories can be ordered here." };
  for (const [i, id] of ids.entries()) {
    const { error } = await supabase.from("categories").update({ sort_order: (i + 1) * 10 }).eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
  updateTag(CATALOG_TAG);
  return { ok: true, data: undefined, message: "Order saved." };
}

/** Moves an existing product into a bicycle type or wheel size (one category per product: no duplicates). */
export async function assignBicycleProduct(productId: string, categoryId: string): Promise<Result> {
  const denied = await guard("products", ["edit"]);
  if (denied) return denied;
  if (!z.uuid().safeParse(productId).success || !z.uuid().safeParse(categoryId).success) return { ok: false, error: "Invalid choice." };
  const supabase = await createClient();
  const { data: fit } = await supabase.from("bicycle_fits").select("kind").eq("category_id", categoryId).maybeSingle();
  if (!fit) return { ok: false, error: "Choose a bicycle type or wheel size." };
  const { error, count } = await supabase.from("products").update({ category_id: categoryId }, { count: "exact" }).eq("id", productId);
  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "Product not found or not allowed." };
  updateTag(CATALOG_TAG);
  return { ok: true, data: undefined, message: "Product moved." };
}

/** Model-specific age/height for one product (empty = use the wheel size's range). */
export async function saveProductBicycleFit(input: unknown): Promise<Result> {
  const denied = await guard("products", ["edit"]);
  if (denied) return denied;
  const parsed = fitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const empty = v.age_min == null && v.age_max == null && v.height_min_cm == null && v.height_max_cm == null && !v.note;
  const { error } = empty
    ? await supabase.from("product_bicycle_fits").delete().eq("product_id", v.product_id)
    : await supabase.from("product_bicycle_fits").upsert(v);
  if (error) return { ok: false, error: error.message };
  updateTag(CATALOG_TAG);
  return { ok: true, data: undefined, message: empty ? "Using the wheel size's range." : "Model recommendation saved." };
}
