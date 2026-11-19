"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { Action, Module } from "@/features/auth/permissions";
import { assertCan, assertStaff } from "@/features/auth/session";
import { dbMessage, fail, fieldErrorsOf, ok, type FormState } from "@/features/forms";
import { ORDER_STATUSES } from "@/features/orders/types";
import { isSupabaseConfigured } from "@/lib/env";
import { EDITABLE_SETTINGS, SYSTEM_SETTINGS } from "./settings-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { queuePushDispatch } from "@/features/push/send";

/**
 * Admin panel server actions. Each one: authorise (server-side role check) →
 * validate → write as the signed-in user (RLS + DB triggers re-check) → refresh.
 */

async function guard(module: Module, action: Action): Promise<FormState | null> {
  if (!isSupabaseConfigured) return fail("Saving is disabled until Supabase is connected.");
  try {
    await assertCan(module, action);
    return null;
  } catch {
    return fail("You don't have permission to do that.");
  }
}

async function superAdminOnly(): Promise<FormState | null> {
  if (!isSupabaseConfigured) return fail("Saving is disabled until Supabase is connected.");
  try {
    await assertStaff("super_admin");
    return null;
  } catch {
    return fail("Only a Super Admin can do that.");
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
  const denied = await guard("inventory", "edit");
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
  const denied = await guard("inventory", "edit");
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
  const denied = await guard("orders", "edit");
  if (denied) return denied;
  const parsed = statusSchema.safeParse({ orderId: str(fd, "orderId"), status: str(fd, "status") });
  if (!parsed.success) return fail("Choose a valid status.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").update({ status: parsed.data.status }).eq("id", parsed.data.orderId).select("id");
  if (error) return fail(dbMessage(error, "Couldn't update the order."));
  if (!data?.length) return fail("Order not found or you can't edit it.");
  refresh();
  queuePushDispatch();
  return ok("Order status updated.");
}

export async function markCodPaidAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("orders", "edit");
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
  const denied = await guard("orders", "edit");
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
  const denied = await guard("orders", "edit");
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
  queuePushDispatch();
  return ok("Shipment saved. The customer sees this on their order page.");
}

// ---------------------------------------------------------------- Store settings (admin)

export async function saveSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("settings", "edit");
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
  const denied = await superAdminOnly();
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
  const denied = await superAdminOnly();
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

// ---------------------------------------------------------------- System settings (super admin)

export async function saveSystemSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await superAdminOnly();
  if (denied) return denied;
  const rows: { key: string; value: unknown; is_public: boolean }[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const [key, def] of Object.entries(SYSTEM_SETTINGS)) {
    const raw = str(fd, key);
    if (def.kind === "choice") {
      if (!def.options.some((o) => o.value === raw)) fieldErrors[key] = "Choose an option.";
      else rows.push({ key, value: raw, is_public: false });
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < def.min || n > def.max) fieldErrors[key] = `Enter a whole number from ${def.min} to ${def.max}.`;
      else rows.push({ key, value: n, is_public: false });
    }
  }
  if (Object.keys(fieldErrors).length) return fail("Please fix the highlighted fields.", fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").upsert(rows, { onConflict: "key" });
  if (error) return fail(dbMessage(error, "Couldn't save system settings."));
  refresh();
  return ok("System settings saved.");
}

// ---------------------------------------------------------------- Order editing
const detailsSchema = z.object({
  orderId: z.uuid(),
  customerName: z.string().trim().min(2, "Enter the customer's name.").max(120),
  customerPhone: z.string().trim().regex(/^\+?[0-9 ]{7,20}$/, "Enter a valid phone number."),
  customerEmail: z.union([z.literal(""), z.email("Enter a valid email.")]),
  customerNote: z.string().trim().max(500),
  line1: z.string().trim().min(3, "Enter the house / street.").max(200),
  line2: z.string().trim().max(200),
  landmark: z.string().trim().max(120),
  city: z.string().trim().min(2, "Enter the city.").max(80),
  state: z.string().trim().min(2, "Enter the state.").max(80),
  postalCode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit PIN code."),
});

/** Customer name, contact and delivery address (any payment state, before shipping). */
export async function updateOrderDetailsAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("orders", "edit");
  if (denied) return denied;
  const keys = ["orderId", "customerName", "customerPhone", "customerEmail", "customerNote", "line1", "line2", "landmark", "city", "state", "postalCode"] as const;
  const parsed = detailsSchema.safeParse(Object.fromEntries(keys.map((k) => [k, str(fd, k)])));
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_order_details", {
    p: {
      order_id: v.orderId,
      customer_name: v.customerName,
      customer_phone: v.customerPhone,
      customer_email: v.customerEmail,
      customer_note: v.customerNote,
      address: { full_name: v.customerName, phone: v.customerPhone, line1: v.line1, line2: v.line2, landmark: v.landmark, city: v.city, state: v.state, postal_code: v.postalCode },
    },
  });
  if (error) return fail(["22023", "42501", "P0002"].includes(error.code ?? "") ? error.message : dbMessage(error, "Couldn't save the customer details."));
  refresh();
  return ok("Customer details saved.");
}

const rupees = (max: number) =>
  z.coerce.number().min(0, "Can't be negative.").max(max, "Too large.").transform((r) => Math.round(r * 100));

const itemsSchema = z.object({
  orderId: z.uuid(),
  items: z
    .array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1, "At least 1.").max(50, "At most 50."), unitPrice: z.number().min(1, "Price must be at least ₹1.").max(1_000_000) }))
    .min(1, "Keep at least one item, or cancel the order instead.")
    .max(30),
  shipping: rupees(100_000),
  discount: rupees(1_000_000),
  reason: z.string().trim().min(3, "Give a short reason for the change.").max(300),
});

/** Items, quantities, unit prices, delivery charge and discount (unpaid orders, before shipping). */
export async function updateOrderItemsAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("orders", "edit");
  if (denied) return denied;
  let items: unknown = [];
  try {
    items = JSON.parse(str(fd, "items") || "[]");
  } catch {
    return fail("The item list couldn't be read. Reload the page and try again.");
  }
  const parsed = itemsSchema.safeParse({ orderId: str(fd, "orderId"), items, shipping: str(fd, "shipping") || "0", discount: str(fd, "discount") || "0", reason: str(fd, "reason") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the items.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_update_order_items", {
    p: {
      order_id: v.orderId,
      items: v.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity, unit_price: Math.round(i.unitPrice * 100) })),
      shipping_total: v.shipping,
      discount_total: v.discount,
      reason: v.reason,
    },
  });
  if (error) return fail(["22023", "23514", "42501", "P0002"].includes(error.code ?? "") ? error.message : dbMessage(error, "Couldn't save the items."));
  refresh();
  queuePushDispatch();
  return ok(`Order updated. New total ₹${((data as number) / 100).toLocaleString("en-IN")}.`);
}

// ---------------------------------------------------------------- Customer deletion
const OPEN_ORDER_STATUSES = ["new", "pending", "confirmed", "processing", "packed", "shipped"];

/**
 * Permanently deletes a customer's ACCOUNT (login, profile, addresses, cart, wishlist,
 * notifications). Orders, service bookings and invoices are kept: their customer link
 * becomes empty and the name/address snapshot on each record stays, so sales history
 * and reports remain correct. Staff accounts are managed in Staff Management instead.
 */
export async function deleteCustomerAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard("customers", "delete");
  if (denied) return denied;
  const me = await assertCan("customers", "delete");
  const userId = z.uuid().safeParse(str(fd, "userId"));
  const typed = str(fd, "confirmCode").toUpperCase();
  if (!userId.success) return fail("Customer not found.");
  if (userId.data === me.id) return fail("You can't delete your own account here.");

  const admin = createAdminClient();
  const [{ data: profile }, { data: roles }, { count: openOrders }] = await Promise.all([
    admin.from("profiles").select("full_name, customer_code").eq("id", userId.data).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userId.data),
    admin.from("orders").select("id", { count: "exact", head: true }).eq("user_id", userId.data).in("status", OPEN_ORDER_STATUSES),
  ]);
  const p = profile as { full_name: string | null; customer_code: string | null } | null;
  if (!p) return fail("Customer not found. They may already be deleted.");
  const expected = (p.customer_code ?? "DELETE").toUpperCase();
  if (typed !== expected) return fail(`Type ${expected} exactly to confirm.`, { confirmCode: `Type ${expected} to confirm.` });
  if (((roles ?? []) as { role: string }[]).some((r) => r.role !== "customer")) {
    return fail("This is a staff account. Remove or deactivate it in Staff Management instead.");
  }
  if (openOrders) {
    return fail(`This customer has ${openOrders} open order${openOrders === 1 ? "" : "s"}. Deliver or cancel ${openOrders === 1 ? "it" : "them"} first.`);
  }

  const { error } = await admin.auth.admin.deleteUser(userId.data);
  if (error) return fail("Couldn't delete the customer. Please try again.");
  await admin.from("audit_logs").insert({
    actor_id: me.id,
    action: "delete",
    entity: "customers",
    entity_id: userId.data,
    details: { customer_code: p.customer_code, name: p.full_name, note: "Account deleted; orders and bookings kept" },
  });
  refresh();
  return ok(p.customer_code ? `Customer ${p.customer_code} deleted.` : "Customer deleted.");
}
