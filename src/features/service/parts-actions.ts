"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { assertCan, getCurrentUser, hasRole } from "@/features/auth/session";
import { dbMessage, fail, fieldErrorsOf, ok, type FormState } from "@/features/forms";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Spare parts and replaced items. The database decides who may do what
 * (migration 0027): technicians on their own jobs, service managers on any job,
 * the "spare_parts" permission for the master list, "billing" approve for custom items.
 */

type Result = { ok: boolean; error?: string };
const uuid = z.uuid();

function friendly(e: { code?: string; message: string }, fallback: string): string {
  if (e.code === "42501") return /paid/.test(e.message) ? "This bill is paid; ask the office to change it." : "You can't change parts on this job.";
  if (/Not enough stock/.test(e.message)) return "Not enough stock for this part.";
  if (/already on the bill/.test(e.message)) return "That item is already on the bill. Change its quantity instead.";
  if (/cancelled/.test(e.message)) return "This booking is cancelled.";
  return fallback;
}

async function team(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const me = await getCurrentUser();
  return Boolean(me && hasRole(me, "service_staff"));
}

export type PartHit = { id: string; sku: string; name: string; selling_price_paise: number; stock: number; compatible_models: string | null };

export async function searchSparePartsAction(query: string): Promise<PartHit[]> {
  if (!(await team())) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_spare_parts", { p_query: String(query ?? "").slice(0, 60), p_limit: 30 });
  return (data ?? []) as PartHit[];
}

export async function setReplacedPartAction(input: { bookingId: string; partId: string; quantity: number }): Promise<Result> {
  if (!(await team())) return { ok: false, error: "Please sign in again." };
  const p = z.object({ bookingId: uuid, partId: uuid, quantity: z.number().int().min(0).max(99) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_replaced_part", { p_booking: p.data.bookingId, p_part: p.data.partId, p_qty: p.data.quantity });
  if (error) return { ok: false, error: friendly(error, "Couldn't update the part.") };
  refresh();
  return { ok: true };
}

export async function addCustomItemAction(input: { bookingId: string; name: string; quantity: number; pricePaise: number; requestMaster: boolean }): Promise<Result> {
  if (!(await team())) return { ok: false, error: "Please sign in again." };
  const p = z
    .object({
      bookingId: uuid,
      name: z.string().trim().min(2, "Enter the item name.").max(120),
      quantity: z.number().int().min(1, "Quantity must be at least 1.").max(99),
      pricePaise: z.number().int().min(0).max(10_000_000),
      requestMaster: z.boolean(),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Please check the item." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_custom_replaced_item", {
    p_booking: p.data.bookingId,
    p_name: p.data.name,
    p_qty: p.data.quantity,
    p_price: p.data.pricePaise,
    p_request_master: p.data.requestMaster,
  });
  if (error) return { ok: false, error: friendly(error, "Couldn't add the item.") };
  refresh();
  return { ok: true };
}

export async function removeCustomItemAction(id: string): Promise<Result> {
  if (!(await team())) return { ok: false, error: "Please sign in again." };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_custom_replaced_item", { p_id: id });
  if (error) return { ok: false, error: friendly(error, "Couldn't remove the item.") };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- Office: custom item review

export async function reviewCustomItemAction(_: FormState, fd: FormData): Promise<FormState> {
  if (!isSupabaseConfigured) return fail("Needs Supabase.");
  try {
    await assertCan("billing", "approve");
  } catch {
    return fail("You don't have permission to approve bill items.");
  }
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const p = z
    .object({
      id: uuid,
      decision: z.enum(["approve", "reject"]),
      price: z.string().transform((v) => (v === "" ? null : Math.round(Number(v) * 100))).refine((n) => n === null || (Number.isFinite(n) && n >= 0 && n <= 10_000_000), "Enter a valid price."),
      addToMaster: z.boolean(),
      sku: z.string().transform((v) => v.toUpperCase()),
      note: z.string().max(300),
    })
    .safeParse({ id: str("id"), decision: str("decision"), price: str("price"), addToMaster: fd.get("addToMaster") === "on", sku: str("sku"), note: str("note") });
  if (!p.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(p.error));
  const v = p.data;
  if (v.addToMaster && v.decision === "approve" && !/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(v.sku)) return fail("Enter a SKU (capital letters, numbers and -).", { sku: "Enter a SKU." });
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_custom_replaced_item", {
    p_id: v.id,
    p_approve: v.decision === "approve",
    p_price: v.price,
    p_add_to_master: v.decision === "approve" && v.addToMaster,
    p_sku: v.addToMaster ? v.sku : null,
    p_note: v.note || null,
  });
  if (error) return fail(error.code === "23505" ? "That SKU is already used." : dbMessage(error, "Couldn't save the decision."));
  refresh();
  return ok(v.decision === "approve" ? (v.addToMaster ? "Approved and added to the master list." : "Approved for this bill.") : "Rejected. It won't appear on the bill.");
}

// ---------------------------------------------------------------- Office: master list

const sku = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/, "Use 3–40 capital letters, numbers or -."));
const money = z
  .string()
  .transform((v) => (v === "" ? 0 : Number(v)))
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 100000, "Enter 0 to 1,00,000.")
  .transform((n) => Math.round(n * 100));

export async function saveSparePartAction(_: FormState, fd: FormData): Promise<FormState> {
  if (!isSupabaseConfigured) return fail("Needs Supabase.");
  const id = String(fd.get("id") ?? "");
  try {
    await assertCan("spare_parts", id ? "edit" : "create");
  } catch {
    return fail("You don't have permission to change spare parts.");
  }
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const p = z
    .object({
      sku,
      name: z.string().min(2, "Enter the part name.").max(120),
      category_id: z.union([z.literal(""), uuid]).transform((v) => v || null),
      compatible_models: z.string().max(300).transform((v) => v || null),
      selling_price_paise: money,
      purchase_price_paise: money,
      low_stock_threshold: z
        .string()
        .transform((v) => (v === "" ? 2 : Number(v)))
        .refine((n) => Number.isInteger(n) && n >= 0 && n <= 10000, "Enter 0–10000."),
      is_active: z.boolean(),
    })
    .safeParse({
      sku: str("sku"),
      name: str("name"),
      category_id: str("category_id"),
      compatible_models: str("compatible_models"),
      selling_price_paise: str("selling"),
      purchase_price_paise: str("purchase"),
      low_stock_threshold: str("threshold"),
      is_active: fd.get("is_active") === "on",
    });
  if (!p.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(p.error));
  const { purchase_price_paise, ...row } = p.data;
  const supabase = await createClient();
  let partId = id;
  if (id) {
    const { error } = await supabase.from("spare_parts").update(row).eq("id", id);
    if (error) return fail(error.code === "23505" ? "That SKU is already used." : dbMessage(error, "Couldn't save the part."));
  } else {
    const { data, error } = await supabase.from("spare_parts").insert(row).select("id").single();
    if (error) return fail(error.code === "23505" ? "That SKU is already used." : dbMessage(error, "Couldn't add the part."));
    partId = (data as { id: string }).id;
  }
  const { error: costError } = await supabase.from("spare_part_costs").upsert({ part_id: partId, purchase_price_paise, updated_at: new Date().toISOString() }, { onConflict: "part_id" });
  refresh();
  return costError ? ok("Part saved (purchase price not saved: you need edit permission).") : ok(id ? "Part saved." : "Part added. Add opening stock below.");
}

export async function adjustSparePartStockAction(_: FormState, fd: FormData): Promise<FormState> {
  if (!isSupabaseConfigured) return fail("Needs Supabase.");
  try {
    await assertCan("spare_parts", "edit");
  } catch {
    return fail("You don't have permission to change stock.");
  }
  const p = z
    .object({
      id: uuid,
      type: z.enum(["opening", "stock_in", "adjustment"]),
      quantity: z.coerce.number().int().refine((n) => n !== 0 && Math.abs(n) <= 10000, "Enter a non-zero quantity."),
      note: z.string().trim().max(300),
    })
    .safeParse({ id: fd.get("id"), type: fd.get("type"), quantity: fd.get("quantity"), note: String(fd.get("note") ?? "") });
  if (!p.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(p.error));
  if (p.data.type !== "adjustment" && p.data.quantity < 0) return fail("Use “Adjustment” to reduce stock.", { quantity: "Must be positive." });
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_spare_part_stock", { p_part: p.data.id, p_type: p.data.type, p_qty: p.data.quantity, p_note: p.data.note || null });
  if (error) return fail(/Not enough stock/.test(error.message) ? "Stock can't go below zero." : dbMessage(error, "Couldn't change the stock."));
  refresh();
  return ok("Stock updated.");
}
