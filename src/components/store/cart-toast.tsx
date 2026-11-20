"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShoppingBag, X } from "lucide-react";
import { CART_ADDED_EVENT, useCart, type CartItem } from "@/features/cart/cart-store";
import { formatPaise } from "@/lib/format";

/** Cart icon count for the header. */
export function CartCount() {
  const count = useCart().reduce((n, i) => n + i.quantity, 0);
  if (!count) return null;
  return (
    <span aria-label={`${count} in cart`} className="absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full bg-gold px-1 text-[0.65rem] leading-4.5 font-bold text-deep">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * "Added to Cart Successfully!" mini-cart: appears after any Add to cart, shows the cart
 * (count, last items, subtotal) with Continue shopping and GO TO CART. Never redirects by itself.
 */
export function CartToast() {
  const items = useCart();
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    let hide: number | undefined;
    const onAdded = (e: Event) => {
      setAdded((e as CustomEvent<{ variantId: string }>).detail.variantId);
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setAdded(null), 7000);
    };
    window.addEventListener(CART_ADDED_EVENT, onAdded);
    return () => {
      window.removeEventListener(CART_ADDED_EVENT, onAdded);
      window.clearTimeout(hide);
    };
  }, []);

  if (!added) return null;
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const latest = items.find((i) => i.variantId === added);
  const others = items.filter((i) => i.variantId !== added).slice(-2).reverse();
  const shown = [latest, ...others].filter((i): i is CartItem => Boolean(i));

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-2xl border bg-white p-4 shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 lg:top-24 lg:right-6 lg:bottom-auto lg:left-auto lg:slide-in-from-top-4"
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success" />
        <p className="font-heading text-sm font-bold text-deep">Added to Cart Successfully!</p>
        <span className="relative ml-auto grid size-9 place-items-center rounded-full bg-royal-50 text-royal">
          <ShoppingBag aria-hidden className="size-4" />
          <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-gold px-1 text-[0.65rem] leading-5 font-bold text-deep">{count}</span>
        </span>
        <button type="button" onClick={() => setAdded(null)} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {shown.map((i) => (
          <li key={i.variantId} className="flex items-center gap-3 text-sm">
            <span className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail */}
              {i.image ? <img src={i.image} alt="" className="size-full object-cover" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-deep">{i.productName}</span>
              <span className="block text-xs text-muted-foreground">
                {i.variantName ? `${i.variantName} · ` : ""}Qty {i.quantity}
              </span>
            </span>
            <span className="text-sm font-semibold text-deep tabular">{formatPaise(i.price * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex justify-between border-t pt-2 text-sm">
        <span className="text-muted-foreground">
          Cart subtotal ({count} item{count === 1 ? "" : "s"})
        </span>
        <span className="font-bold text-deep tabular">{formatPaise(subtotal)}</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setAdded(null)} className="h-11 rounded-full border text-sm font-semibold text-deep hover:bg-muted">
          Continue shopping
        </button>
        <Link href="/cart" onClick={() => setAdded(null)} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-royal text-sm font-bold text-white hover:bg-royal-800">
          GO TO CART <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </div>
  );
}
