import { type NextRequest, NextResponse } from "next/server";
import { applyRazorpayPayment } from "@/features/payments/razorpay-service";
import { fetchRazorpayPayment, getRazorpayConfig, RZP_ORDER_ID, RZP_PAYMENT_ID, verifyPaymentSignature } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Redirect-mode return URL for Razorpay Checkout (used instead of pop-ups, which
 * in-app browsers such as WhatsApp/Instagram and some phones block).
 * Razorpay POSTs the result here as a form; the signature is verified with the
 * secret key and the payment re-read from Razorpay before anything is recorded.
 * The customer is then sent to the success or retry page.
 */
export async function POST(request: NextRequest) {
  const cfg = getRazorpayConfig();
  const form = await request.formData().catch(() => null);
  const field = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" ? v.trim() : "";
  };

  let razorpayOrderId = field("razorpay_order_id");
  const paymentId = field("razorpay_payment_id");
  const signature = field("razorpay_signature");
  // On failure Razorpay sends error[...] fields; the order ID is inside error[metadata].
  let failedPaymentId = "";
  if (!razorpayOrderId) {
    try {
      const meta = JSON.parse(field("error[metadata]") || "{}") as { order_id?: string; payment_id?: string };
      razorpayOrderId = meta.order_id ?? "";
      failedPaymentId = meta.payment_id ?? "";
    } catch {
      // ignore malformed metadata
    }
  }

  const go = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  if (!cfg || !RZP_ORDER_ID.test(razorpayOrderId)) return go("/account/orders");

  const admin = createAdminClient();
  const { data } = await admin
    .from("payments")
    .select("order:orders!inner(order_number)")
    .eq("provider", "razorpay")
    .eq("provider_order_id", razorpayOrderId)
    .maybeSingle();
  const orderNumber = (data as { order: { order_number: string } } | null)?.order.order_number;
  if (!orderNumber) return go("/account/orders");
  const retry = `/checkout/payment?order=${orderNumber}`;

  try {
    if (RZP_PAYMENT_ID.test(paymentId) && /^[0-9a-f]{64}$/i.test(signature)) {
      if (!verifyPaymentSignature(cfg.keySecret, razorpayOrderId, paymentId, signature)) return go(`${retry}&failed=1`);
      const payment = await fetchRazorpayPayment(cfg, paymentId);
      if (payment.order_id !== razorpayOrderId) return go(`${retry}&failed=1`);
      const result = await applyRazorpayPayment(cfg, payment, "checkout");
      return result === "paid" || result === "already_paid" || result === "duplicate" ? go(`/checkout/success?order=${orderNumber}`) : go(retry);
    }
    if (RZP_PAYMENT_ID.test(failedPaymentId)) {
      const payment = await fetchRazorpayPayment(cfg, failedPaymentId);
      if (payment.order_id === razorpayOrderId) await applyRazorpayPayment(cfg, payment, "checkout");
    }
  } catch {
    // The webhook records the final state; the retry page shows the current one.
    return go(retry);
  }
  return go(`${retry}&failed=1`);
}
