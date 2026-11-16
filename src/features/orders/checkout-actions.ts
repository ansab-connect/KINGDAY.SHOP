"use server";

import { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const input = z.object({
  items: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(50) })).min(1, "Your cart is empty.").max(30),
  addressId: z.uuid("Choose a delivery address."),
  note: z.string().trim().max(500).optional(),
});

export type PlaceOrderResult = { ok: true; orderNumber: string; total: number } | { ok: false; error: string };

/**
 * Product checkout → a real order (Cash on Delivery). Only variant IDs and quantities
 * are sent; public.place_order re-prices everything, checks stock, reserves it and
 * applies shipping and COD rules in one transaction.
 */
export async function placeOrderAction(raw: unknown): Promise<PlaceOrderResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Online ordering isn't available yet. Please order on WhatsApp." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your order." };
  const { items, addressId, note } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_order", {
    p: { items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })), address_id: addressId, note: note ?? "" },
  });
  if (error) {
    // Messages raised by place_order are written for customers; anything else stays generic.
    const friendly = ["22023", "23514", "42501"].includes(error.code ?? "");
    return { ok: false, error: friendly ? error.message : "We couldn't place the order. Please try again or order on WhatsApp." };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { order_number: string; grand_total: number } | undefined;
  if (!row) return { ok: false, error: "We couldn't place the order. Please try again." };
  return { ok: true, orderNumber: row.order_number, total: row.grand_total };
}
