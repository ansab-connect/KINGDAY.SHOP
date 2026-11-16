import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Public checkout settings (display only; the database re-applies them when the order is placed). */
export type CheckoutSettings = { flatShipping: number; freeShippingAbove: number | null; codEnabled: boolean; codMax: number | null };

export async function getCheckoutSettings(): Promise<CheckoutSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_settings")
    .select("key, value")
    .in("key", ["shipping.flat_rate", "shipping.free_shipping_threshold", "checkout.cod_enabled", "checkout.cod_max_order_value"]);
  const v = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    flatShipping: num(v.get("shipping.flat_rate")) ?? 0,
    freeShippingAbove: num(v.get("shipping.free_shipping_threshold")),
    codEnabled: v.get("checkout.cod_enabled") !== false,
    // Not public (RLS): null for customers, and the database enforces it anyway.
    codMax: num(v.get("checkout.cod_max_order_value")),
  };
}

export const shippingFor = (subtotal: number, s: CheckoutSettings) => (s.freeShippingAbove !== null && subtotal >= s.freeShippingAbove ? 0 : s.flatShipping);
