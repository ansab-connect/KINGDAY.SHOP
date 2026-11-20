import "server-only";
import { cacheLife } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

/** Public checkout settings (display only; the database re-applies them when the order is placed). */
export type CheckoutSettings = { flatShipping: number; freeShippingAbove: number | null; codEnabled: boolean; codMax: number | null; freeShippingPrepaid: boolean };

export async function getCheckoutSettings(): Promise<CheckoutSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_settings")
    .select("key, value")
    .in("key", ["shipping.flat_rate", "shipping.free_shipping_threshold", "checkout.cod_enabled", "checkout.cod_max_order_value", "checkout.free_shipping_prepaid"]);
  const v = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    flatShipping: num(v.get("shipping.flat_rate")) ?? 0,
    freeShippingAbove: num(v.get("shipping.free_shipping_threshold")),
    codEnabled: v.get("checkout.cod_enabled") !== false,
    freeShippingPrepaid: v.get("checkout.free_shipping_prepaid") === true,
    // Not public (RLS): null for customers, and the database enforces it anyway.
    codMax: num(v.get("checkout.cod_max_order_value")),
  };
}

export const shippingFor = (subtotal: number, s: CheckoutSettings) => (s.freeShippingAbove !== null && subtotal >= s.freeShippingAbove ? 0 : s.flatShipping);

export type PublicPriceSettings = { flatShipping: number; freeShippingAbove: number | null; freeShippingPrepaid: boolean; codEnabled: boolean };

/** Delivery / COD settings for product pages (public, cached; checkout re-reads them). */
export async function getPublicPriceSettings(): Promise<PublicPriceSettings> {
  "use cache";
  cacheLife("minutes");
  const fallback = { flatShipping: 0, freeShippingAbove: null, freeShippingPrepaid: false, codEnabled: true };
  if (!isSupabaseConfigured) return fallback;
  try {
    const { data } = await createPublicClient()
      .from("store_settings")
      .select("key, value")
      .in("key", ["shipping.flat_rate", "shipping.free_shipping_threshold", "checkout.cod_enabled", "checkout.free_shipping_prepaid"]);
    const v = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    return {
      flatShipping: num(v.get("shipping.flat_rate")) ?? 0,
      freeShippingAbove: num(v.get("shipping.free_shipping_threshold")),
      freeShippingPrepaid: v.get("checkout.free_shipping_prepaid") === true,
      codEnabled: v.get("checkout.cod_enabled") !== false,
    };
  } catch {
    return fallback;
  }
}
