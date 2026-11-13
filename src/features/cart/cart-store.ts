"use client";

import { useSyncExternalStore } from "react";

/**
 * Browser cart (localStorage). Prices stored here are for display only: any
 * order (WhatsApp now, online checkout later) is re-priced by the store.
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
};

const KEY = "kingday.cart.v1";
const listeners = new Set<() => void>();
const EMPTY: CartItem[] = [];
let cache: CartItem[] | null = null;

function read(): CartItem[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
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
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable (private mode): cart lives for this page only */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
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

export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function addToCart(item: Omit<CartItem, "quantity">, quantity: number) {
  const items = [...read()];
  const i = items.findIndex((x) => x.variantId === item.variantId);
  const max = Math.max(1, item.maxQty);
  if (i >= 0) items[i] = { ...items[i], ...item, quantity: Math.min(max, items[i].quantity + quantity) };
  else items.push({ ...item, quantity: Math.min(max, Math.max(1, quantity)) });
  write(items);
}

export function setCartQuantity(variantId: string, quantity: number) {
  write(read().map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(Math.max(1, quantity), Math.max(1, i.maxQty)) } : i)));
}

export function removeFromCart(variantId: string) {
  write(read().filter((i) => i.variantId !== variantId));
}

export function clearCart() {
  write([]);
}
