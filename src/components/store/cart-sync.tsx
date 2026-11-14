"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { readCart, replaceCart, useCart, type CartItem } from "@/features/cart/cart-store";
import { createClient } from "@/lib/supabase/client";

const OWNER_KEY = "kingday.cart.owner";

type Row = {
  variant_id: string;
  quantity: number;
  product_variants: {
    sku: string;
    name: string | null;
    price: number;
    is_active: boolean;
    products: { name: string; slug: string } | null;
    inventory: { on_hand: number; reserved: number } | { on_hand: number; reserved: number }[] | null;
  } | null;
};

/**
 * Keeps the browser cart and the signed-in customer's saved cart (cart_items) in step:
 * on sign-in the two are merged, then every change is saved to the account.
 * RLS limits cart_items to the owner. Prices are display-only; orders are re-priced.
 */
export function CartSync() {
  const items = useCart();
  const userId = useRef<string | null>(null);
  const ready = useRef(false);
  const last = useRef<string>("");

  const pathname = usePathname();

  // Load + merge whenever the signed-in account changes (sign-in, sign-out, switch).
  // Checked on every page change because sign-out happens on the server.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const sessionUid = session.session?.user.id ?? null;
      if (cancelled || (ready.current && sessionUid === userId.current) || (!sessionUid && !userId.current && ready.current)) return;
      const { data } = sessionUid ? await supabase.auth.getUser() : { data: { user: null } };
      const uid = data.user?.id ?? null;
      if (cancelled) return;
      ready.current = false;
      userId.current = null;
      // The browser cart belongs to whoever was signed in: after sign-out (or a
      // different account) it is cleared so the next person never sees it.
      let owner: string | null = null;
      try {
        owner = localStorage.getItem(OWNER_KEY);
      } catch {}
      if (owner && owner !== uid) replaceCart([]);
      if (!uid) {
        try {
          localStorage.removeItem(OWNER_KEY);
        } catch {}
        ready.current = true;
        return;
      }
      try {
        localStorage.setItem(OWNER_KEY, uid);
      } catch {}
      userId.current = uid;
      const { data: rows } = await supabase
        .from("cart_items")
        .select("variant_id, quantity, product_variants(sku, name, price, is_active, products(name, slug), inventory(on_hand, reserved))")
        .eq("user_id", uid);
      const server: CartItem[] = ((rows ?? []) as unknown as Row[]).flatMap((r) => {
        const v = r.product_variants;
        if (!v || !v.is_active || !v.products) return [];
        const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
        const maxQty = Math.max(0, (inv?.on_hand ?? 0) - (inv?.reserved ?? 0));
        if (maxQty <= 0) return [];
        return [{
          variantId: r.variant_id,
          productName: v.products.name,
          variantName: v.name && v.name !== "Default" ? v.name : null,
          sku: v.sku,
          price: v.price,
          quantity: Math.min(r.quantity, maxQty),
          maxQty,
          url: `/products/${v.products.slug}`,
        }];
      });
      if (cancelled) return;
      const merged = new Map<string, CartItem>(server.map((i) => [i.variantId, i]));
      // Read the live cart: during hydration `items` is still the empty server snapshot.
      for (const local of owner && owner !== uid ? [] : readCart()) {
        const s = merged.get(local.variantId);
        merged.set(local.variantId, s ? { ...s, quantity: Math.min(s.maxQty, Math.max(s.quantity, local.quantity)) } : local);
      }
      replaceCart([...merged.values()]);
      ready.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Save changes to the account.
  useEffect(() => {
    if (!ready.current || !userId.current) return;
    const snapshot = JSON.stringify(items.map((i) => [i.variantId, i.quantity]));
    if (snapshot === last.current) return;
    last.current = snapshot;
    const uid = userId.current;
    const supabase = createClient();
    const timer = setTimeout(async () => {
      const keep = items.map((i) => i.variantId);
      if (items.length) {
        await supabase.from("cart_items").upsert(
          items.map((i) => ({ user_id: uid, variant_id: i.variantId, quantity: Math.min(50, i.quantity), updated_at: new Date().toISOString() })),
          { onConflict: "user_id,variant_id" },
        );
      }
      const del = supabase.from("cart_items").delete().eq("user_id", uid);
      await (keep.length ? del.not("variant_id", "in", `(${keep.join(",")})`) : del);
    }, 400);
    return () => clearTimeout(timer);
  }, [items]);

  return null;
}
