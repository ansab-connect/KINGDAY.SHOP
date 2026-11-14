import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sends unsent in-app notifications as Web Push messages to the owner's devices.
 * Notifications are created by database triggers (orders, shipping, service jobs,
 * invoices, promotions, reminders); this only delivers them.
 * Payload = title, short text and an in-app link. No prices, addresses or IDs beyond what the title shows.
 */

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:kingdaystore@gmail.com";

export const isPushConfigured = Boolean(publicKey && privateKey);

let vapidSet = false;
function ensureVapid() {
  if (!vapidSet && publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidSet = true;
  }
}

type Claimed = { id: number; user_id: string; title: string; body: string | null; link: string | null };
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

export async function dispatchPush(): Promise<{ sent: number; removed: number }> {
  if (!isPushConfigured) return { sent: 0, removed: 0 };
  ensureVapid();
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { sent: 0, removed: 0 };
  }
  const { data: claimed } = await admin.rpc("claim_push_notifications", { p_limit: 200 });
  const notes = (claimed ?? []) as Claimed[];
  if (!notes.length) return { sent: 0, removed: 0 };

  const users = [...new Set(notes.map((n) => n.user_id))];
  const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", users);
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  let sent = 0;
  const dead = new Set<string>();
  const used = new Set<string>();
  await Promise.all(
    notes.flatMap((n) =>
      (byUser.get(n.user_id) ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: n.title, body: n.body ?? "", url: n.link ?? "/", tag: `kd-${n.id}` }),
            { TTL: 12 * 3600, urgency: "normal" },
          );
          sent++;
          used.add(s.id);
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.add(s.id); // device unsubscribed or expired
        }
      }),
    ),
  );
  if (dead.size) await admin.from("push_subscriptions").delete().in("id", [...dead]);
  if (used.size) await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", [...used]);
  return { sent, removed: dead.size };
}

/** Deliver pending notifications after the response is sent (never slows the user down). */
export function queuePushDispatch() {
  if (!isPushConfigured) return;
  try {
    after(async () => {
      try {
        await dispatchPush();
      } catch {
        /* delivery is best-effort; the in-app notification is already saved */
      }
    });
  } catch {
    /* outside a request scope */
  }
}
