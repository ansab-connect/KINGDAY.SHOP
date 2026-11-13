"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { assertStaff, type StaffRole } from "@/features/auth/session";
import { dbMessage, fail, fieldErrorsOf, ok, type FormState } from "@/features/forms";
import { ORDER_STATUSES } from "@/features/orders/types";
import { isSupabaseConfigured } from "@/lib/env";
import { EDITABLE_SETTINGS } from "./settings-keys";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin panel server actions. Each one: authorise (server-side role check) →
 * validate → write as the signed-in user (RLS + DB triggers re-check) → refresh.
 */

async function guard(minimum: StaffRole): Promise<FormState | null> {
  if (!isSupabaseConfigured) return fail("Saving is disabled until Supabase is connected.");
  try {
    await assertStaff(minimum);
    return null;
  } catch {
    return fail("You don't have permission to do that.");
  }
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

// ---------------------------------------------------------------- Inventory
const stockSchema = z.object({
  variantId: z.uuid("Choose a SKU."),
  type: z.enum(["stock_in", "stock_out", "adjustment", "return"]),
  quantity: z.coerce.number().int("Whole numbers only.").min(1, "Enter at least 1.").max(10000, "Too large."),
  direction: z.enum(["add", "remove"]).default("add"),
  reason: z.string().trim().min(3, "Give a short reason.").max(300),
});

export async function adjustStockAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("staff");
  if (denied) return denied;
  const parsed = stockSchema.safeParse({
    variantId: str(fd, "variantId"),
    type: str(fd, "type"),
    quantity: str(fd, "quantity"),
    direction: str(fd, "direction") || "add",
    reason: str(fd, "reason"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const p = parsed.data;
  const negative = p.type === "stock_out" || (p.type === "adjustment" && p.direction === "remove");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_stock", {
    p_variant_id: p.variantId,
    p_quantity: negative ? -p.quantity : p.quantity,
    p_type: p.type,
    p_reason: p.reason,
  });
  if (error) return fail(dbMessage(error, "Couldn't update stock. Please try again."));
  refresh();
  return ok(`Stock updated. New balance: ${data}.`);
}

const reorderSchema = z.object({ variantId: z.uuid(), level: z.coerce.number().int().min(0).max(10000) });

export async function setReorderLevelAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("staff");
  if (denied) return denied;
  const parsed = reorderSchema.safeParse({ variantId: str(fd, "variantId"), level: str(fd, "level") });
  if (!parsed.success) return fail("Enter a reorder level between 0 and 10,000.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_reorder_level", { p_variant_id: parsed.data.variantId, p_level: parsed.data.level });
  if (error) return fail(dbMessage(error, "Couldn't save the reorder level."));
  refresh();
  return ok("Reorder level saved.");
}

// ---------------------------------------------------------------- Orders
const statusSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(ORDER_STATUSES),
});

export async function updateOrderStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("staff");
  if (denied) return denied;
  const parsed = statusSchema.safeParse({ orderId: str(fd, "orderId"), status: str(fd, "status") });
  if (!parsed.success) return fail("Choose a valid status.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").update({ status: parsed.data.status }).eq("id", parsed.data.orderId).select("id");
  if (error) return fail(dbMessage(error, "Couldn't update the order."));
  if (!data?.length) return fail("Order not found or you can't edit it.");
  refresh();
  return ok("Order status updated.");
}

export async function markCodPaidAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("staff");
  if (denied) return denied;
  const orderId = z.uuid().safeParse(str(fd, "orderId"));
  if (!orderId.success) return fail("Invalid order.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").update({ payment_status: "paid" }).eq("id", orderId.data).eq("payment_method", "cod").select("id");
  if (error) return fail(dbMessage(error, "Couldn't record the payment."));
  if (!data?.length) return fail("Only cash-on-delivery orders can be marked paid here.");
  refresh();
  return ok("Cash payment recorded.");
}

const noteSchema = z.object({ orderId: z.uuid(), note: z.string().trim().max(2000) });

export async function saveOrderNoteAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("staff");
  if (denied) return denied;
  const parsed = noteSchema.safeParse({ orderId: str(fd, "orderId"), note: str(fd, "note") });
  if (!parsed.success) return fail("Notes can be up to 2,000 characters.");
  const supabase = await createClient();
  const { error } = await supabase.from("orders").update({ internal_note: parsed.data.note || null }).eq("id", parsed.data.orderId);
  if (error) return fail(dbMessage(error, "Couldn't save the note."));
  refresh();
  return ok("Note saved.");
}

const shipmentSchema = z.object({
  orderId: z.uuid(),
  shipmentId: z.uuid().optional(),
  carrier: z.string().trim().max(80).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
  trackingUrl: z.union([z.literal(""), z.url({ protocol: /^https$/, message: "Use a full https:// link." })]).optional(),
  status: z.enum(["pending", "packed", "shipped", "in_transit", "delivered"]),
});

export async function saveShipmentAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("staff");
  if (denied) return denied;
  const parsed = shipmentSchema.safeParse({
    orderId: str(fd, "orderId"),
    shipmentId: str(fd, "shipmentId") || undefined,
    carrier: str(fd, "carrier") || undefined,
    trackingNumber: str(fd, "trackingNumber") || undefined,
    trackingUrl: str(fd, "trackingUrl"),
    status: str(fd, "status") || "pending",
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const p = parsed.data;
  const now = new Date().toISOString();
  const row = {
    carrier: p.carrier ?? null,
    tracking_number: p.trackingNumber ?? null,
    tracking_url: p.trackingUrl || null,
    status: p.status,
    ...(p.status === "shipped" || p.status === "in_transit" ? { shipped_at: now } : {}),
    ...(p.status === "delivered" ? { delivered_at: now } : {}),
  };
  const supabase = await createClient();
  const { error } = p.shipmentId
    ? await supabase.from("shipments").update(row).eq("id", p.shipmentId).eq("order_id", p.orderId)
    : await supabase.from("shipments").insert({ ...row, order_id: p.orderId });
  if (error) return fail(dbMessage(error, "Couldn't save the shipment."));
  refresh();
  return ok("Shipment saved. The customer sees this on their order page.");
}

// ---------------------------------------------------------------- Store settings (admin)

export async function saveSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("admin");
  if (denied) return denied;
  const rows: { key: string; value: unknown; is_public: boolean }[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const [key, def] of Object.entries(EDITABLE_SETTINGS)) {
    const raw = str(fd, key);
    if (def.kind === "boolean") {
      rows.push({ key, value: fd.get(key) === "on", is_public: def.isPublic });
    } else if (def.kind === "rupees") {
      if (raw === "") {
        rows.push({ key, value: null, is_public: def.isPublic });
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 10_000_000) {
        fieldErrors[key] = "Enter an amount between 0 and 1,00,00,000.";
        continue;
      }
      rows.push({ key, value: Math.round(n * 100), is_public: def.isPublic });
    } else {
      if (raw.length < 2 || raw.length > 120) {
        fieldErrors[key] = "Use 2–120 characters.";
        continue;
      }
      rows.push({ key, value: raw, is_public: def.isPublic });
    }
  }
  if (Object.keys(fieldErrors).length) return fail("Please fix the highlighted fields.", fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").upsert(rows, { onConflict: "key" });
  if (error) return fail(dbMessage(error, "Couldn't save settings."));
  refresh();
  return ok("Settings saved.");
}

// ---------------------------------------------------------------- Roles (super admin)
const roleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["super_admin", "admin", "staff"]),
});

export async function grantRoleAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("super_admin");
  if (denied) return denied;
  const parsed = roleSchema.safeParse({ userId: str(fd, "userId"), role: str(fd, "role") });
  if (!parsed.success) return fail("Choose a user and a role.");
  const me = await assertStaff("super_admin");
  const supabase = await createClient();
  const { error } = await supabase.from("user_roles").insert({ user_id: parsed.data.userId, role: parsed.data.role, granted_by: me.id });
  if (error) return fail(error.code === "23505" ? "This user already has that role." : dbMessage(error, "Couldn't grant the role."));
  refresh();
  return ok("Role granted.");
}

export async function revokeRoleAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("super_admin");
  if (denied) return denied;
  const parsed = roleSchema.safeParse({ userId: str(fd, "userId"), role: str(fd, "role") });
  if (!parsed.success) return fail("Invalid request.");
  const me = await assertStaff("super_admin");
  if (parsed.data.userId === me.id) return fail("You can't remove your own role.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("user_roles").delete().eq("user_id", parsed.data.userId).eq("role", parsed.data.role).select("user_id");
  if (error) return fail(dbMessage(error, "Couldn't revoke the role."));
  if (!data?.length) return fail("That role was already removed.");
  refresh();
  return ok("Role revoked.");
}
