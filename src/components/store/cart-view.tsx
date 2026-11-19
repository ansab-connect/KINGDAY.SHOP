"use client";

import Link from "next/link";
import { Mail, ShoppingBag } from "lucide-react";
import { CartLine } from "@/components/store/cart-line";
import { QuickAccount } from "@/components/store/quick-account";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { OFFICIAL_WHATSAPP, supportMailto } from "@/config/storefront";
import { removeFromCart, setCartQuantity, useCart } from "@/features/cart/cart-store";
import { formatPaise } from "@/lib/format";

/** Products tab of the cart: checkout (Cash on Delivery) or order on WhatsApp. */
export type CartCustomer = { name: string; code: string; mobile: string | null } | null;

/** Public delivery settings (display only; the database applies them when the order is placed). */
export type DeliverySettings = { flatShipping: number; freeShippingAbove: number | null } | null;

export function CartView({ customer, accounts = true, delivery = null }: { customer: CartCustomer; accounts?: boolean; delivery?: DeliverySettings }) {
  const items = useCart();
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shipping = delivery ? (delivery.freeShippingAbove !== null && subtotal >= delivery.freeShippingAbove ? 0 : delivery.flatShipping) : null;
  const count = items.reduce((s, i) => s + i.quantity, 0);

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
    ...(customer ? [`Customer: ${customer.name} (${customer.code})${customer.mobile ? `, ${customer.mobile}` : ""}`] : []),
    "",
    ...items.map((i, n) => `${n + 1}. ${i.productName}${i.variantName ? ` (${i.variantName})` : ""}, SKU ${i.sku}, qty ${i.quantity}, ${formatPaise(i.price)} each\n   ${i.url}`),
    "",
    `Estimated total: ${formatPaise(subtotal + (shipping ?? 0))}`,
  ].join("\n");
  const orderHref = `https://wa.me/${OFFICIAL_WHATSAPP}?text=${encodeURIComponent(message)}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <ul className="flex flex-col divide-y rounded-2xl border" aria-label="Products in your cart">
        {items.map((i) => (
          <CartLine key={i.variantId} item={i} onQuantity={(q) => setCartQuantity(i.variantId, q)} onRemove={() => removeFromCart(i.variantId)} />
        ))}
      </ul>

      <aside className="h-fit rounded-2xl border p-5 lg:sticky lg:top-28">
        <h2 className="font-heading text-lg font-semibold text-deep">Order summary</h2>
        <dl className="mt-4 flex flex-col gap-2 text-sm" aria-live="polite">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal ({count} item{count === 1 ? "" : "s"})</dt><dd className="tabular">{formatPaise(subtotal)}</dd></div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery</dt>
            <dd className="tabular">{shipping === null ? "At checkout" : shipping ? formatPaise(shipping) : "Free"}</dd>
          </div>
          <div className="flex justify-between border-t pt-3 text-base font-semibold text-deep"><dt>Total</dt><dd className="tabular">{formatPaise(subtotal + (shipping ?? 0))}</dd></div>
        </dl>
        {delivery?.freeShippingAbove && shipping ? (
          <p className="mt-2 text-xs text-muted-foreground">Add {formatPaise(delivery.freeShippingAbove - subtotal)} more for free delivery.</p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">Prices are confirmed when you place the order.</p>
        {customer ? (
          <>
            <p className="mt-4 text-xs text-muted-foreground">Ordering as <span className="font-semibold text-deep">{customer.name}</span> · {customer.code}</p>
            <Link href="/checkout" className="mt-3 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3.5 text-sm font-bold tracking-wide text-deep uppercase hover:bg-gold-300">
              Proceed to checkout
            </Link>
            <a href={orderHref} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold text-deep hover:bg-muted">
              <WhatsAppIcon className="size-4" /> Or order on WhatsApp
            </a>
          </>
        ) : !accounts ? (
          <a href={orderHref} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3.5 text-sm font-bold tracking-wide text-deep uppercase hover:bg-gold-300">
            <WhatsAppIcon className="size-5" /> Order on WhatsApp
          </a>
        ) : (
          <div className="mt-4">
            <p className="mb-3 text-sm text-deep">Sign in or create your account to place the order. It takes a few seconds and your cart is kept.</p>
            <QuickAccount next="/checkout" />
          </div>
        )}
        <a href={supportMailto("Cart enquiry")} className="mt-3 inline-flex w-full items-center justify-center gap-2 text-sm text-muted-foreground hover:text-royal">
          <Mail aria-hidden className="size-4" /> Questions? Email support
        </a>
      </aside>
    </div>
  );
}
