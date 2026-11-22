"use client";

import type { CheckoutSession } from "@/features/payments/razorpay-service";
import { reportRazorpayFailureAction, verifyRazorpayPaymentAction } from "@/features/orders/checkout-actions";

/**
 * Opens Razorpay Standard Checkout for a server-created Razorpay order.
 * The browser only ever gets the public key ID and the order ID; the amount is
 * fixed by the server-side order and every result is verified on the server.
 */

type RazorpaySuccess = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayFailure = { error?: { description?: string; metadata?: { order_id?: string; payment_id?: string } } };
type RazorpayInstance = { open(): void; on(event: "payment.failed", cb: (r: RazorpayFailure) => void): void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.body.appendChild(s);
  });
  return loading;
}

export type CheckoutOutcome =
  | { kind: "paid"; orderNumber: string }
  | { kind: "pending"; orderNumber: string; message: string }
  | { kind: "closed"; orderNumber: string; lastError: string | null };

export async function openRazorpayCheckout(session: CheckoutSession): Promise<CheckoutOutcome> {
  await loadScript();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Couldn't load the payment window. Please try again.");

  return new Promise<CheckoutOutcome>((resolve) => {
    let lastError: string | null = null;
    let settled = false;
    const done = (o: CheckoutOutcome) => {
      if (!settled) {
        settled = true;
        resolve(o);
      }
    };

    const rzp = new Razorpay({
      key: session.keyId,
      order_id: session.razorpayOrderId,
      amount: session.amount,
      currency: "INR",
      name: "KING DAY",
      description: `Order ${session.orderNumber}`,
      prefill: session.prefill,
      // The customer already gave these at checkout: don't ask again.
      readonly: { contact: true, name: true, ...(session.prefill.email ? { email: true } : {}) },
      notes: { order_number: session.orderNumber },
      theme: { color: "#4B0082" },
      // Full-page redirect to the bank instead of a pop-up (pop-ups are blocked in
      // WhatsApp/Instagram in-app browsers). Razorpay POSTs the result to our server.
      redirect: true,
      callback_url: `${window.location.origin}/api/razorpay/callback`,
      timeout: 900, // 15 minutes; the order itself expires after 30
      retry: { enabled: true, max_count: 3 },
      config: {
        display: {
          blocks: {
            main: {
              name: "Pay using",
              instruments: [{ method: "upi" }, { method: "card" }, { method: "netbanking" }],
            },
          },
          sequence: ["block.main"],
          preferences: { show_default_blocks: true },
        },
      },
      handler: async (r: RazorpaySuccess) => {
        const res = await verifyRazorpayPaymentAction({
          razorpayOrderId: r.razorpay_order_id,
          razorpayPaymentId: r.razorpay_payment_id,
          razorpaySignature: r.razorpay_signature,
        });
        if (res.ok) done({ kind: "paid", orderNumber: res.orderNumber });
        else done({ kind: "pending", orderNumber: res.orderNumber ?? session.orderNumber, message: res.error });
      },
      modal: {
        confirm_close: true,
        ondismiss: () => done({ kind: "closed", orderNumber: session.orderNumber, lastError }),
      },
    });

    rzp.on("payment.failed", (r) => {
      lastError = r.error?.description ?? "The payment didn't go through.";
      // Razorpay keeps the window open for a retry; record the failure on the server.
      void reportRazorpayFailureAction({
        razorpayOrderId: r.error?.metadata?.order_id ?? session.razorpayOrderId,
        razorpayPaymentId: r.error?.metadata?.payment_id,
      });
    });
    rzp.open();
  });
}
