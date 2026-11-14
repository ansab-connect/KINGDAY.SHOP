"use server";

import { z } from "zod";
import { assertCan, getCurrentUser, hasRole } from "@/features/auth/session";
import { fail, ok, type FormState } from "@/features/forms";
import { createClient } from "@/lib/supabase/server";
import { queuePushDispatch } from "./send";

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Saves this device's push subscription for the signed-in user (RLS: own rows only). */
export async function savePushSubscriptionAction(input: unknown, userAgent: string): Promise<{ ok: boolean; error?: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Please sign in first." };
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "This browser returned an invalid subscription." };
  const supabase = await createClient();
  // Same device re-subscribing: replace its old row.
  await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: me.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    user_agent: userAgent.slice(0, 300),
  });
  if (error) return { ok: false, error: "Couldn't turn on notifications. Please try again." };
  return { ok: true };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<{ ok: boolean }> {
  const me = await getCurrentUser();
  if (!me || !z.url().safeParse(endpoint).success) return { ok: false };
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

const promoSchema = z.object({
  title: z.string().trim().min(3, "Write a short title.").max(120),
  body: z.string().trim().max(300),
  link: z.string().trim().regex(/^\/[A-Za-z0-9/_?=&.-]*$/, "Use a page on this site, e.g. /offers"),
});

/** Admin: send a promotion to customers who opted in to offers. */
export async function sendPromotionAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const me = await assertCan("customers", "edit");
    if (!hasRole(me, "admin")) throw new Error();
  } catch {
    return fail("Only admins can send promotions.");
  }
  const parsed = promoSchema.safeParse({ title: fd.get("title"), body: fd.get("body") ?? "", link: fd.get("link") || "/offers" });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the fields.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_promotion", { p_title: parsed.data.title, p_body: parsed.data.body, p_link: parsed.data.link });
  if (error) return fail("Couldn't send the promotion.");
  queuePushDispatch();
  return ok(`Sent to ${data as number} customer${data === 1 ? "" : "s"} who opted in to offers.`);
}
