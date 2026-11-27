import "server-only";
import { createClient } from "@/lib/supabase/server";
import { publicStorageUrl } from "@/lib/storage";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/features/orders/types";

/** Reads for the signed-in customer. RLS limits every query to their own rows. */

export type Profile = { full_name: string | null; phone: string | null; marketing_opt_in: boolean };
export type Address = {
  id: string; label: string | null; full_name: string; phone: string; line1: string; line2: string | null;
  landmark: string | null; city: string; state: string; postal_code: string; is_default: boolean;
};
export type MyOrder = {
  id: string; order_number: string; status: OrderStatus; payment_status: PaymentStatus; payment_method: PaymentMethod;
  grand_total: number; placed_at: string;
  order_items: { product_name: string; variant_name: string | null; sku: string; quantity: number; line_total: number; warranty: string | null; cycle_size: string | null }[];
  shipments: { carrier: string | null; tracking_number: string | null; tracking_url: string | null; status: string }[];
  order_status_history: { to_status: OrderStatus; created_at: string }[];
};
export type WishlistEntry = { product_id: string; name: string; slug: string; image: string | null; price: number | null; mrp: number | null; active: boolean };

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name, phone, marketing_opt_in").eq("id", userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function getAddresses(): Promise<Address[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("addresses")
    .select("id, label, full_name, phone, line1, line2, landmark, city, state, postal_code, is_default")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  return (data as Address[] | null) ?? [];
}

export async function getMyOrders(): Promise<MyOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, payment_status, payment_method, grand_total, placed_at,
       order_items(product_name, variant_name, sku, quantity, line_total, warranty, cycle_size),
       shipments(carrier, tracking_number, tracking_url, status),
       order_status_history(to_status, created_at)`,
    )
    .order("placed_at", { ascending: false })
    .limit(50);
  return (data as MyOrder[] | null) ?? [];
}

export async function getWishlist(): Promise<WishlistEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wishlist_items")
    .select(
      `product_id, created_at,
       product:products(name, slug, status,
         product_variants(price, mrp, is_default, is_active),
         product_images(storage_path, position))`,
    )
    .order("created_at", { ascending: false });

  type Row = {
    product_id: string;
    product: {
      name: string; slug: string; status: string;
      product_variants: { price: number; mrp: number; is_default: boolean; is_active: boolean }[];
      product_images: { storage_path: string; position: number }[];
    } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.product)
    .map((r) => {
      const p = r.product!;
      const v = p.product_variants.find((x) => x.is_default && x.is_active) ?? p.product_variants.find((x) => x.is_active);
      const img = [...p.product_images].sort((a, b) => a.position - b.position)[0];
      return {
        product_id: r.product_id, name: p.name, slug: p.slug,
        image: publicStorageUrl("product-images", img?.storage_path),
        price: v?.price ?? null, mrp: v?.mrp ?? null, active: p.status === "active",
      };
    });
}
