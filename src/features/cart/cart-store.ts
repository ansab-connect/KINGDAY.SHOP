"use client";

import { useSyncExternalStore } from "react";
import { contentParams, track } from "@/lib/meta-pixel";

/**
 * Browser cart (localStorage) and the one-item "Buy now" list (sessionStorage).
 * Prices stored here are for display only: every order is re-priced by the database.
 */
export type CartItem = {
  variantId: string;
  productName: string;
  variantName: string | null;
  sku: string;
  /** Paise, display only. */
  price: number;
  quantity: number;
  maxQty: number;
  url: string;
  /** Thumbnail URL, display only. */
  image?: string | null;
};

const EMPTY: CartItem[] = [];

const clampQty = (quantity: number, maxQty: number) => Math.min(Math.max(1, Math.round(quantity) || 1), Math.max(1, maxQty));

function createItemStore(storageName: "localStorage" | "sessionStorage", key: string) {
  const listeners = new Set<() => void>();
  let cache: CartItem[] | null = null;
  const storage = () => (typeof window === "undefined" ? null : window[storageName]);

  function read(): CartItem[] {
    if (cache) return cache;
    try {
      const raw = JSON.parse(storage()?.getItem(key) ?? "[]");
      cache = Array.isArray(raw)
        ? raw.filter((i): i is CartItem => i && typeof i.variantId === "string" && Number.isInteger(i.quantity) && i.quantity > 0)
        : [];
    } catch {
      cache = [];
    }
    return cache;
  }

  function write(items: CartItem[]) {
    cache = items;
    try {
      storage()?.setItem(key, JSON.stringify(items));
    } catch {
      /* storage unavailable (private mode): items live for this page only */
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        cache = null;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  const use = () => useSyncExternalStore(subscribe, read, () => EMPTY);
  const setQuantity = (variantId: string, quantity: number) =>
    write(read().map((i) => (i.variantId === variantId ? { ...i, quantity: clampQty(quantity, i.maxQty) } : i)));
  const remove = (variantId: string) => write(read().filter((i) => i.variantId !== variantId));

  return { read, write, use, setQuantity, remove };
}

// ---------------------------------------------------------------- Cart
const cart = createItemStore("localStorage", "kingday.cart.v1");

export function useCart(): CartItem[] {
  return cart.use();
}

/** Fired after Add to cart; the mini-cart (CartToast) listens for it. */
export const CART_ADDED_EVENT = "kingday:cart-added";

export function addToCart(item: Omit<CartItem, "quantity">, quantity: number) {
  const items = [...cart.read()];
  const i = items.findIndex((x) => x.variantId === item.variantId);
  if (i >= 0) items[i] = { ...items[i], ...item, image: item.image ?? items[i].image, quantity: clampQty(items[i].quantity + quantity, item.maxQty) };
  else items.push({ ...item, quantity: clampQty(quantity, item.maxQty) });
  cart.write(items);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_ADDED_EVENT, { detail: { variantId: item.variantId } }));
    track("AddToCart", contentParams([{ id: item.sku, name: item.productName, price: item.price, quantity }]));
  }
}

export const setCartQuantity = cart.setQuantity;
export const removeFromCart = cart.remove;

export function clearCart() {
  cart.write([]);
}

/** Replace the whole cart (used when merging with the customer's saved cart). */
export function replaceCart(items: CartItem[]) {
  cart.write(items);
}

/** Current cart outside React (read straight from storage). */
export function readCart(): CartItem[] {
  return cart.read();
}

// ---------------------------------------------------------------- Buy now
/**
 * "Buy now" checks out exactly one product at the chosen quantity, without touching
 * (or being mixed with) whatever is already in the cart. Kept for this browser tab only.
 */
const buyNow = createItemStore("sessionStorage", "kingday.buynow.v1");

export function useBuyNow(): CartItem[] {
  return buyNow.use();
}

export function startBuyNow(item: Omit<CartItem, "quantity">, quantity: number) {
  buyNow.write([{ ...item, quantity: clampQty(quantity, item.maxQty) }]);
}

export const setBuyNowQuantity = buyNow.setQuantity;
export const removeBuyNow = buyNow.remove;

export function clearBuyNow() {
  buyNow.write([]);
}
