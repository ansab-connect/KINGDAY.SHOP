import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { runCleanup } from "@/features/data/temporary";
import { dispatchPush } from "@/features/push/send";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily job (Vercel Cron, see vercel.json): queues "service tomorrow" reminders
 * for customers and technicians, then delivers pending push notifications.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; anything else is refused.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const valid = Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!valid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("queue_service_reminders");
    if (error) return NextResponse.json({ error: "reminders failed" }, { status: 500 });
    // Unpaid online orders older than 30 minutes release their reserved stock.
    const { data: expired } = await admin.rpc("expire_unpaid_orders");
    const push = await dispatchPush();
    // Temporary files: cleaned on the date set in Admin → Data (only files already downloaded).
    const cleanup = await runCleanup(admin).catch(() => ({ ran: false, message: "cleanup failed" }));
    return NextResponse.json({ reminders: data ?? 0, expiredOrders: expired ?? 0, ...push, cleanup: cleanup.message });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
