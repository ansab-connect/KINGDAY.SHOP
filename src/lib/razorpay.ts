import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay server helpers (no SDK: plain REST + HMAC, works on any runtime).
 *
 * Env (server only, never NEXT_PUBLIC_):
 *   RAZORPAY_KEY_ID          rzp_test_… now; rzp_live_… later
 *   RAZORPAY_KEY_SECRET      API secret for that key
 *   RAZORPAY_WEBHOOK_SECRET  secret set on the webhook in the Razorpay dashboard
 *   RAZORPAY_ALLOW_LIVE      must be "true" before a rzp_live_ key is accepted
 *
 * The key ID is public by design (the checkout widget needs it); it is sent to the
 * browser per payment by the server, so no NEXT_PUBLIC_ variable is required.
 */

const API = "https://api.razorpay.com/v1";

export type RazorpayMode = "test" | "live";
export type RazorpayConfig = { keyId: string; keySecret: string; mode: RazorpayMode };

export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = (process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "").trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET ?? "").trim();
  if (!keyId || !keySecret) return null;
  const mode: RazorpayMode | null = keyId.startsWith("rzp_test_") ? "test" : keyId.startsWith("rzp_live_") ? "live" : null;
  if (!mode) return null;
  // Safety switch: live keys stay disabled until the owner explicitly turns them on.
  if (mode === "live" && process.env.RAZORPAY_ALLOW_LIVE !== "true") return null;
  return { keyId, keySecret, mode };
}

export const isRazorpayEnabled = () => getRazorpayConfig() !== null;

function safeEqualHex(expectedHex: string, given: string): boolean {
  if (!/^[0-9a-f]+$/i.test(given)) return false;
  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(given, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(secret: string, orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook_secret). */
export function verifyWebhookSignature(secret: string, rawBody: string, signature: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

async function call<T>(cfg: RazorpayConfig, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string; code?: string } };
  if (!res.ok) {
    // Never include credentials; Razorpay's description is safe to log.
    throw new Error(`Razorpay ${res.status}: ${json.error?.description ?? "request failed"}`);
  }
  return json;
}

export type RazorpayOrder = { id: string; amount: number; currency: string; receipt: string; status: string };

export function createRazorpayOrder(cfg: RazorpayConfig, input: { amount: number; receipt: string; notes: Record<string, string> }) {
  return call<RazorpayOrder>(cfg, "/orders", {
    method: "POST",
    body: { amount: input.amount, currency: "INR", receipt: input.receipt.slice(0, 40), notes: input.notes, payment_capture: 1 },
  });
}

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string;
  captured: boolean;
  error_description?: string | null;
};

export const fetchRazorpayPayment = (cfg: RazorpayConfig, paymentId: string) =>
  call<RazorpayPayment>(cfg, `/payments/${encodeURIComponent(paymentId)}`);

export const captureRazorpayPayment = (cfg: RazorpayConfig, paymentId: string, amount: number) =>
  call<RazorpayPayment>(cfg, `/payments/${encodeURIComponent(paymentId)}/capture`, { method: "POST", body: { amount, currency: "INR" } });

export const RZP_ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/;
export const RZP_PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;
