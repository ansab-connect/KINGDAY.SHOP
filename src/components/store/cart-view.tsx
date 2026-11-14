"use client";

import Link from "next/link";
import { Mail, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { OFFICIAL_WHATSAPP, supportMailto } from "@/config/storefront";
import { removeFromCart, setCartQuantity, useCart } from "@/features/cart/cart-store";
import { formatPaise } from "@/lib/format";

/** Cart page body. Ordering happens on WhatsApp until online checkout launches. */
export function CartView() {
  const items = useCart();
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
        <ShoppingBag aria-hidden className="size-10 text-royal-300" />
        <p className="mt-4 font-heading text-lg font-semibold text-deep">Your cart is empty</p>
        <p className="mt-1 text-sm text-muted-foreground">Add a ride you love and it will wait for you here.</p>
        <Link href="/shop" className="mt-6 rounded-full bg-royal px-5 py-2.5 text-sm font-semibold text-white">Continue shopping</Link>
      </div>
    );
  }

  const message = [
    "Hi KING DAY, I'd like to order:",
    "",
    ...items.map((i, n) => `${n + 1}. ${i.productName}${i.variantName ? ` (${i.variantName})` : ""}, SKU ${i.sku}, qty ${i.quantity}, ${formatPaise(i.price)} each\n   ${i.url}`),
    "",
    `Estimated total: ${formatPaise(subtotal)}`,
  ].join("\n");
  const orderHref = `https://wa.me/${OFFICIAL_WHATSAPP}?text=${encodeURIComponent(message)}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <ul className="flex flex-col divide-y rounded-2xl border">
        {items.map((i) => (
          <li key={i.variantId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="min-w-0 flex-1">
              <Link href={i.url.replace(/^https?:\/\/[^/]+/, "")} className="font-heading font-semibold text-deep hover:text-royal">{i.productName}</Link>
              <p className="text-xs text-muted-foreground">{i.variantName ? `${i.variantName} · ` : ""}{formatPaise(i.price)} each</p>
            </div>
            <div className="flex items-center justify-between gap-4 sm:justify-end">
              <div className="flex h-10 items-center rounded-full border">
                <button type="button" aria-label={`Decrease quantity of ${i.productName}`} disabled={i.quantity <= 1} onClick={() => setCartQuantity(i.variantId, i.quantity - 1)} className="grid size-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><Minus className="size-4" /></button>
                <span className="w-8 text-center text-sm font-semibold tabular">{i.quantity}</span>
                <button type="button" aria-label={`Increase quantity of ${i.productName}`} disabled={i.quantity >= i.maxQty} onClick={() => setCartQuantity(i.variantId, i.quantity + 1)} className="grid size-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><Plus className="size-4" /></button>
              </div>
              <span className="w-24 text-right font-semibold tabular">{formatPaise(i.price * i.quantity)}</span>
              <button type="button" aria-label={`Remove ${i.productName}`} onClick={() => removeFromCart(i.variantId)} className="grid size-10 place-items-center rounded-full text-danger hover:bg-danger-soft"><Trash2 className="size-4" /></button>
            </div>
          </li>
        ))}
      </ul>

      <aside className="h-fit rounded-2xl border p-5 lg:sticky lg:top-28">
        <h2 className="font-heading text-lg font-semibold text-deep">Order summary</h2>
        <dl className="mt-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Items</dt><dd className="tabular">{items.reduce((s, i) => s + i.quantity, 0)}</dd></div>
          <div className="flex justify-between border-t pt-3 text-base font-semibold text-deep"><dt>Estimated total</dt><dd className="tabular">{formatPaise(subtotal)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Final price, delivery and offers are confirmed by our team on WhatsApp.</p>
        <a href={orderHref} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3.5 text-sm font-bold tracking-wide text-deep uppercase hover:bg-gold-300">
          <WhatsAppIcon className="size-5" /> Order on WhatsApp
        </a>
        <a href={supportMailto("Cart enquiry")} className="mt-3 inline-flex w-full items-center justify-center gap-2 text-sm text-muted-foreground hover:text-royal">
          <Mail aria-hidden className="size-4" /> Questions? Email support
        </a>
      </aside>
    </div>
  );
}
