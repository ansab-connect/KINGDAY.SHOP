import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus, PaymentMethod } from "./types";

/** Order detail, read as the signed-in user: RLS returns only the customer's own orders, or any order for staff. */

export type OrderAddress = { full_name?: string; phone?: string; line1?: string; line2?: string; landmark?: string; city?: string; state?: string; postal_code?: string };

export type OrderDetail = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  shipping_address: OrderAddress;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: string;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  tax_total: number;
  grand_total: number;
  coupon_code: string | null;
  customer_note: string | null;
  internal_note: string | null;
  placed_at: string;
  order_items: { id: string; variant_id: string | null; product_name: string; variant_name: string | null; sku: string; unit_price: number; quantity: number; line_total: number; warranty: string | null; cycle_size: string | null }[];
  shipments: { id: string; carrier: string | null; tracking_number: string | null; tracking_url: string | null; status: string; shipped_at: string | null; delivered_at: string | null; created_at: string }[];
  order_status_history: { id: number; from_status: OrderStatus | null; to_status: OrderStatus; note: string | null; created_at: string }[];
};

const BASE =
  "id, order_number, customer_name, customer_email, customer_phone, shipping_address, status, payment_method, payment_status, subtotal, discount_total, shipping_total, tax_total, grand_total, coupon_code, customer_note, placed_at, order_items(id, variant_id, product_name, variant_name, sku, unit_price, quantity, line_total, warranty, cycle_size), shipments(id, carrier, tracking_number, tracking_url, status, shipped_at, delivered_at, created_at), order_status_history(id, from_status, to_status, note, created_at)";

export async function getOrderDetail(id: string, opts: { staff: boolean }): Promise<OrderDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(opts.staff ? `${BASE}, internal_note` : BASE)
    .eq("id", id)
    .order("created_at", { referencedTable: "order_status_history", ascending: true })
    .maybeSingle();
  if (error) throw new Error("Could not load the order.");
  if (!data) return null;
  const d = data as unknown as OrderDetail;
  return { ...d, internal_note: opts.staff ? d.internal_note : null };
}

export type OrderSummary = { id: string; order_number: string; status: OrderStatus; payment_status: string; grand_total: number; placed_at: string; items: number };

export async function getMyOrders(userId: string): Promise<OrderSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, status, payment_status, grand_total, placed_at, order_items(quantity)")
    .eq("user_id", userId)
    .order("placed_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Could not load your orders.");
  return ((data ?? []) as unknown as (Omit<OrderSummary, "items"> & { order_items: { quantity: number }[] })[]).map((o) => ({
    ...o,
    items: o.order_items.reduce((s, i) => s + i.quantity, 0),
  }));
}

/** Next statuses allowed from the current one (mirrors private.order_transition_allowed). */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  new: ["pending", "confirmed", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "packed", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  returned: ["refunded"],
  cancelled: ["refunded"],
  refunded: [],
};

/** Customer-facing tracking steps. */
export const TRACKING_STEPS: { status: OrderStatus; label: string }[] = [
  { status: "new", label: "Order placed" },
  { status: "confirmed", label: "Confirmed" },
  { status: "packed", label: "Packed" },
  { status: "shipped", label: "Shipped" },
  { status: "delivered", label: "Delivered" },
];

const RANK: Partial<Record<OrderStatus, number>> = { new: 0, pending: 0, confirmed: 1, processing: 1, packed: 2, shipped: 3, delivered: 4 };
export const trackingRank = (s: OrderStatus) => RANK[s] ?? -1;
