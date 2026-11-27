"use server";

import { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import { applyRazorpayPayment, startPaymentAttempt, type CheckoutSession } from "@/features/payments/razorpay-service";
import { isSupabaseConfigured } from "@/lib/env";
import { fetchRazorpayPayment, getRazorpayConfig, RZP_ORDER_ID, RZP_PAYMENT_ID, verifyPaymentSignature } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const input = z.object({
  items: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(50) })).min(1, "Your cart is empty.").max(30),
  addressId: z.uuid("Choose a delivery address."),
  note: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(["cod", "razorpay"]).default("cod"),
  checkoutKey: z.uuid().optional(),
  couponCode: z.string().trim().max(24).regex(/^[A-Za-z0-9]*$/).optional(),
});

export type PlaceOrderResult =
  | { ok: true; orderNumber: string; total: number; paid?: boolean; payment?: CheckoutSession }
  | { ok: false; error: string };

const GENERIC = "We couldn't place the order. Please try again or order on WhatsApp.";
const PAY_GENERIC = "We couldn't start the online payment. Please try again, or choose cash on delivery.";

/**
 * Product checkout → a real order. Only variant IDs and quantities are sent;
 * public.place_order re-prices everything, checks stock, reserves it and applies
 * shipping and COD rules in one transaction. The checkout key makes a retried or
 * double-clicked submit return the same order instead of creating another.
 * For online payment, the server then creates the Razorpay order (amount from our DB).
 */
export async function placeOrderAction(raw: unknown): Promise<PlaceOrderResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Online ordering isn't available yet. Please order on WhatsApp." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your order." };
  const { items, addressId, note, paymentMethod, checkoutKey, couponCode } = parsed.data;

  const cfg = paymentMethod === "razorpay" ? getRazorpayConfig() : null;
  if (paymentMethod === "razorpay" && !cfg) return { ok: false, error: "Online payment isn't available right now. Please choose cash on delivery." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_order", {
    p: {
      items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
      address_id: addressId,
      note: note ?? "",
      payment_method: paymentMethod,
      ...(checkoutKey ? { checkout_key: checkoutKey } : {}),
      ...(couponCode ? { coupon_code: couponCode.toUpperCase() } : {}),
    },
  });
  if (error) {
    // Messages raised by place_order are written for customers; anything else stays generic.
    const friendly = ["22023", "23514", "42501"].includes(error.code ?? "");
    return { ok: false, error: friendly ? error.message : GENERIC };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { order_id: string; order_number: string; grand_total: number; payment_method: string; payment_status: string; order_status: string }
    | undefined;
  if (!row) return { ok: false, error: GENERIC };

  if (row.payment_method !== "razorpay") return { ok: true, orderNumber: row.order_number, total: row.grand_total };
  if (row.payment_status === "paid") return { ok: true, orderNumber: row.order_number, total: row.grand_total, paid: true };
  if (row.order_status !== "pending") return { ok: false, error: "This checkout has expired. Please review your cart and try again." };

  try {
    const payment = await startForOrder(row.order_id);
    return { ok: true, orderNumber: row.order_number, total: row.grand_total, payment };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message.startsWith("This order") ? e.message : PAY_GENERIC };
  }
}

async function startForOrder(orderId: string): Promise<CheckoutSession> {
  const cfg = getRazorpayConfig();
  if (!cfg) throw new Error("Online payment isn't available right now.");
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("id, order_number, grand_total, customer_name, customer_email, customer_phone")
    .eq("id", orderId)
    .single();
  if (!data) throw new Error("Order not found");
  return startPaymentAttempt(cfg, data as Parameters<typeof startPaymentAttempt>[1]);
}

/** Pay again for one of the signed-in customer's unpaid online orders (after a failure or a closed window). */
export async function retryPaymentAction(orderNumber: string): Promise<{ ok: true; payment: CheckoutSession } | { ok: false; error: string; paid?: boolean }> {
  if (!isSupabaseConfigured || !getRazorpayConfig()) return { ok: false, error: "Online payment isn't available right now." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!/^KD[0-9]{6,}$/.test(orderNumber)) return { ok: false, error: "Order not found." };
  // RLS: a customer can only read their own orders.
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, user_id, payment_method, payment_status, status, placed_at")
    .eq("order_number", orderNumber)
    .maybeSingle();
  const o = data as { id: string; user_id: string; payment_method: string; payment_status: string; status: string; placed_at: string } | null;
  if (!o || o.user_id !== user.id || o.payment_method !== "razorpay") return { ok: false, error: "Order not found." };
  if (o.payment_status === "paid") return { ok: false, error: "This order is already paid.", paid: true };
  if (o.status !== "pending" || Date.now() - Date.parse(o.placed_at) > 29 * 60_000) {
    return { ok: false, error: "This order has expired and its items were released. Please place the order again from your cart." };
  }
  try {
    return { ok: true, payment: await startForOrder(o.id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message.startsWith("This order") ? e.message : PAY_GENERIC };
  }
}

const verifyInput = z.object({
  razorpayOrderId: z.string().regex(RZP_ORDER_ID),
  razorpayPaymentId: z.string().regex(RZP_PAYMENT_ID),
  razorpaySignature: z.string().regex(/^[0-9a-f]{64}$/i),
});

export type VerifyResult = { ok: true; orderNumber: string } | { ok: false; error: string; orderNumber?: string };

/** Ownership check: the Razorpay order must be an attempt on the caller's own order. */
async function ownAttempt(razorpayOrderId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("payments")
    .select("order:orders!inner(id, order_number, user_id)")
    .eq("provider", "razorpay")
    .eq("provider_order_id", razorpayOrderId)
    .maybeSingle();
  const order = (data as { order: { id: string; order_number: string; user_id: string } } | null)?.order;
  return order && order.user_id === user.id ? order : null;
}

/**
 * Called by the browser after Razorpay reports success. The signature is verified with
 * the secret key, then the payment is re-read from Razorpay before anything is updated.
 */
export async function verifyRazorpayPaymentAction(raw: unknown): Promise<VerifyResult> {
  const cfg = getRazorpayConfig();
  if (!isSupabaseConfigured || !cfg) return { ok: false, error: "Online payment isn't available right now." };
  const parsed = verifyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "We couldn't verify this payment." };
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;
  const order = await ownAttempt(razorpayOrderId);
  if (!order) return { ok: false, error: "We couldn't verify this payment." };
  if (!verifyPaymentSignature(cfg.keySecret, razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return { ok: false, error: "Payment verification failed. If money was deducted, it will be refunded automatically.", orderNumber: order.order_number };
  }
  try {
    const payment = await fetchRazorpayPayment(cfg, razorpayPaymentId);
    if (payment.order_id !== razorpayOrderId) return { ok: false, error: "We couldn't verify this payment.", orderNumber: order.order_number };
    const result = await applyRazorpayPayment(cfg, payment, "checkout");
    if (result === "paid" || result === "already_paid") return { ok: true, orderNumber: order.order_number };
    if (result === "authorized") return { ok: false, error: "Your payment is being confirmed. We'll update your order shortly.", orderNumber: order.order_number };
    if (result === "duplicate") return { ok: true, orderNumber: order.order_number };
    return { ok: false, error: "The payment didn't go through. Please try again.", orderNumber: order.order_number };
  } catch {
    // The webhook will still record it; the success page re-reads the order status.
    return { ok: false, error: "We're confirming your payment. Please check your order in a minute.", orderNumber: order.order_number };
  }
}

/** The browser reports a failed attempt; the server re-reads it from Razorpay before recording it. */
export async function reportRazorpayFailureAction(raw: unknown): Promise<{ orderNumber: string | null }> {
  const cfg = getRazorpayConfig();
  const parsed = z.object({ razorpayOrderId: z.string().regex(RZP_ORDER_ID), razorpayPaymentId: z.string().regex(RZP_PAYMENT_ID).optional() }).safeParse(raw);
  if (!cfg || !parsed.success) return { orderNumber: null };
  const order = await ownAttempt(parsed.data.razorpayOrderId);
  if (!order) return { orderNumber: null };
  if (parsed.data.razorpayPaymentId) {
    try {
      const payment = await fetchRazorpayPayment(cfg, parsed.data.razorpayPaymentId);
      if (payment.order_id === parsed.data.razorpayOrderId) await applyRazorpayPayment(cfg, payment, "checkout");
    } catch {
      // The webhook records it anyway.
    }
  }
  return { orderNumber: order.order_number };
}

export type OrderQuote = { subtotal: number; discount: number; shipping: number; total: number; couponError?: string };

/** Exact totals from the database (same function place_order uses), for checkout to show. */
export async function quoteOrderAction(raw: unknown): Promise<OrderQuote | null> {
  if (!isSupabaseConfigured) return null;
  const parsed = z
    .object({ items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(30), method: z.enum(["razorpay", "cod"]), coupon: z.string().trim().max(24).regex(/^[A-Za-z0-9]*$/).optional() })
    .safeParse(raw);
  if (!parsed.success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("price_order", {
    p: { items: parsed.data.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })), payment_method: parsed.data.method, ...(parsed.data.coupon ? { coupon_code: parsed.data.coupon.toUpperCase() } : {}) },
  });
  // A bad coupon: say why, and quote without it.
  if (error && parsed.data.coupon && error.code === "22023") {
    const base = await quoteOrderAction({ items: parsed.data.items, method: parsed.data.method });
    return base ? { ...base, couponError: error.message } : null;
  }
  const row = (data as { subtotal: number; discount_total: number; shipping_total: number; grand_total: number }[] | null)?.[0];
  if (error || !row) return null;
  return { subtotal: row.subtotal, discount: row.discount_total, shipping: row.shipping_total, total: row.grand_total };
}
