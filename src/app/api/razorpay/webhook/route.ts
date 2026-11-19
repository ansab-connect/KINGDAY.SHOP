import { type NextRequest, NextResponse } from "next/server";
import { applyRazorpayPayment } from "@/features/payments/razorpay-service";
import { getRazorpayConfig, verifyWebhookSignature, type RazorpayPayment } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Razorpay webhook (Dashboard → Settings → Webhooks):
 *   URL     https://www.kingday.in/api/razorpay/webhook
 *   Events  payment.authorized, payment.captured, payment.failed, order.paid
 *   Secret  same value as RAZORPAY_WEBHOOK_SECRET
 *
 * The raw body is HMAC-verified before parsing. Each delivery (x-razorpay-event-id)
 * is applied once; the database function is also idempotent per payment.
 */
const HANDLED = new Set(["payment.authorized", "payment.captured", "payment.failed", "order.paid"]);

export async function POST(request: NextRequest) {
  const cfg = getRazorpayConfig();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!cfg || !secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const raw = await request.text();
  if (raw.length > 200_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(secret, raw, signature)) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let body: { event?: string; payload?: { payment?: { entity?: RazorpayPayment } } };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const event = body.event ?? "";
  if (!HANDLED.has(event)) return NextResponse.json({ ok: true, ignored: event });
  const payment = body.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id) return NextResponse.json({ ok: true, ignored: "no payment" });

  const admin = createAdminClient();
  const eventId = (request.headers.get("x-razorpay-event-id") ?? `${event}:${payment.id}:${payment.status}`).slice(0, 120);
  const { error: dupError } = await admin.from("payment_webhook_events").insert({ event_id: eventId, event });
  if (dupError) {
    if (dupError.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ error: "storage" }, { status: 500 });
  }

  try {
    const result = await applyRazorpayPayment(cfg, payment, "webhook", { event, id: payment.id, status: payment.status, method: payment.method, amount: payment.amount });
    return NextResponse.json({ ok: true, result });
  } catch {
    // Let Razorpay retry this delivery later.
    await admin.from("payment_webhook_events").delete().eq("event_id", eventId);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
