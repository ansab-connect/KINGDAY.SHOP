import "server-only";
import {
  captureRazorpayPayment,
  createRazorpayOrder,
  fetchRazorpayPayment,
  type RazorpayConfig,
  type RazorpayPayment,
} from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side Razorpay workflow. Uses the service role ONLY after the caller has
 * been authorised (checkout actions check the signed-in owner; the webhook checks
 * the HMAC signature). The database functions re-check amounts and are idempotent.
 */

export type RecordResult = "paid" | "already_paid" | "authorized" | "failed" | "ignored" | "duplicate" | "amount_mismatch" | "unknown_order";

export type CheckoutSession = {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  orderNumber: string;
  prefill: { name: string; email?: string; contact: string };
};

type PayableOrder = { id: string; order_number: string; grand_total: number; customer_name: string; customer_email: string | null; customer_phone: string };

/** Create a Razorpay order for one of our orders and register it as a payment attempt. */
export async function startPaymentAttempt(cfg: RazorpayConfig, order: PayableOrder): Promise<CheckoutSession> {
  const rzp = await createRazorpayOrder(cfg, {
    amount: order.grand_total,
    receipt: order.order_number,
    notes: { order_id: order.id, order_number: order.order_number },
  });
  if (rzp.amount !== order.grand_total) throw new Error("Razorpay amount mismatch");
  const admin = createAdminClient();
  const { error } = await admin.rpc("attach_razorpay_order", {
    p_order_id: order.id,
    p_provider_order_id: rzp.id,
    p_amount: order.grand_total,
  });
  if (error) throw new Error(error.code === "22023" ? error.message : "Could not start the payment");
  const digits = order.customer_phone.replace(/\D/g, "");
  return {
    keyId: cfg.keyId,
    razorpayOrderId: rzp.id,
    amount: order.grand_total,
    orderNumber: order.order_number,
    prefill: {
      name: order.customer_name,
      ...(order.customer_email ? { email: order.customer_email } : {}),
      contact: digits.length === 10 ? `+91${digits}` : `+${digits}`,
    },
  };
}

/**
 * Apply a payment fetched from the Razorpay API (never trust browser-sent status).
 * Authorised payments are captured first, so the customer is charged exactly once.
 */
export async function applyRazorpayPayment(cfg: RazorpayConfig, payment: RazorpayPayment, source: "checkout" | "webhook", event?: unknown): Promise<RecordResult> {
  let p = payment;
  if (p.status === "authorized" && p.order_id) {
    const admin = createAdminClient();
    // Only capture payments for attempts we created, for the amount we expect.
    const { data } = await admin.from("payments").select("amount, status").eq("provider", "razorpay").eq("provider_order_id", p.order_id).maybeSingle();
    const row = data as { amount: number; status: string } | null;
    if (row && row.status !== "paid" && row.amount === p.amount) {
      try {
        p = await captureRazorpayPayment(cfg, p.id, p.amount);
      } catch {
        // Already captured (auto-capture or a parallel webhook): re-read the truth.
        p = await fetchRazorpayPayment(cfg, p.id);
      }
    }
  }
  if (!p.order_id) return "unknown_order";
  const status = p.status === "captured" ? "captured" : p.status === "authorized" ? "authorized" : p.status === "failed" ? "failed" : null;
  if (!status) return "ignored";
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_razorpay_payment", {
    p: {
      provider_order_id: p.order_id,
      provider_payment_id: p.id,
      status,
      amount: p.amount,
      method: p.method,
      error: p.error_description ?? null,
      source,
      event: event ?? { id: p.id, status: p.status, method: p.method, amount: p.amount },
    },
  });
  if (error) throw new Error("Could not record the payment");
  return data as RecordResult;
}
