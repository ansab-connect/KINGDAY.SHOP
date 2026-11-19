"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Banknote, CreditCard, Loader2, Lock, MapPin, ShoppingBag } from "lucide-react";
import { openRazorpayCheckout } from "@/components/store/checkout/razorpay-checkout";
import { removeFromCart, useCart } from "@/features/cart/cart-store";
import { placeOrderAction } from "@/features/orders/checkout-actions";
import type { Address } from "@/features/account/queries";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

type Settings = { flatShipping: number; freeShippingAbove: number | null; codEnabled: boolean };
type Method = "razorpay" | "cod";

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : undefined);

/**
 * Product checkout. Shows an estimate from the browser cart; the database re-prices
 * the order, checks stock and applies shipping when it is placed.
 */
export function CheckoutView({
  addresses,
  settings,
  customer,
  onlineEnabled,
  testMode,
}: {
  addresses: Address[];
  settings: Settings;
  customer: { name: string; code: string };
  onlineEnabled: boolean;
  testMode: boolean;
}) {
  const router = useRouter();
  const items = useCart();
  const [addressId, setAddressId] = useState(addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<Method>(onlineEnabled ? "razorpay" : "cod");
  // One key per checkout attempt: a double click or network retry returns the same order.
  // A changed cart, address, method or note starts a new attempt.
  const attempt = useRef<{ sig: string; key: string | undefined } | null>(null);

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shipping = settings.freeShippingAbove !== null && subtotal >= settings.freeShippingAbove ? 0 : settings.flatShipping;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
        <ShoppingBag aria-hidden className="size-10 text-royal-300" />
        <p className="mt-4 font-heading text-lg font-semibold text-deep">Your product cart is empty</p>
        <Link href="/shop" className="mt-6 rounded-full bg-royal px-5 py-2.5 text-sm font-semibold text-white">Continue shopping</Link>
      </div>
    );
  }

  const place = () => {
    setError(null);
    const sig = [items.map((i) => `${i.variantId}:${i.quantity}`).join(","), addressId, method, note].join("|");
    if (attempt.current?.sig !== sig) attempt.current = { sig, key: newKey() };
    const checkoutKey = attempt.current.key;
    start(async () => {
      const res = await placeOrderAction({
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        addressId,
        note,
        paymentMethod: method,
        checkoutKey,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // The order now holds the items (stock is reserved), so they leave the cart.
      const clearCart = () => {
        for (const i of items) removeFromCart(i.variantId);
      };
      const order = encodeURIComponent(res.orderNumber);
      if (!res.payment) {
        clearCart();
        router.push(`/checkout/success?order=${order}`);
        return;
      }
      // Redirect-mode payment leaves this page, so clear the cart before opening it.
      clearCart();
      try {
        const outcome = await openRazorpayCheckout(res.payment);
        if (outcome.kind === "paid") router.push(`/checkout/success?order=${order}`);
        else router.push(`/checkout/payment?order=${order}${outcome.kind === "closed" && outcome.lastError ? "&failed=1" : ""}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't open the payment window.");
        router.push(`/checkout/payment?order=${order}`);
      }
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <section aria-labelledby="addr-h" className="rounded-2xl border p-4 sm:p-5">
          <h2 id="addr-h" className="flex items-center gap-2 font-heading text-lg font-semibold text-deep">
            <MapPin aria-hidden className="size-5 text-royal" /> Delivery address
          </h2>
          <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Choose a delivery address</legend>
            {addresses.map((a) => (
              <label
                key={a.id}
                className={cn("flex cursor-pointer gap-3 rounded-xl border p-4 text-sm", addressId === a.id ? "border-royal bg-royal-50/60 ring-1 ring-royal" : "hover:border-royal/40")}
              >
                <input type="radio" name="address" value={a.id} checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1 size-4 accent-royal" />
                <span className="min-w-0 break-words">
                  <span className="block font-semibold text-deep">{a.label || a.full_name}</span>
                  <span className="block text-muted-foreground">
                    {a.full_name} · {a.phone}
                    <br />
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""}, {a.city} {a.postal_code}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Link href="/account/addresses" className="mt-3 inline-block text-sm font-semibold text-royal hover:underline">
            Add or edit addresses
          </Link>
        </section>

        <section aria-labelledby="pay-h" className="rounded-2xl border p-4 sm:p-5">
          <h2 id="pay-h" className="flex items-center gap-2 font-heading text-lg font-semibold text-deep">
            <Banknote aria-hidden className="size-5 text-royal" /> Payment
          </h2>
          <fieldset className="mt-3 grid gap-3">
            <legend className="sr-only">Choose how to pay</legend>
            {onlineEnabled ? (
              <MethodOption
                checked={method === "razorpay"}
                onSelect={() => setMethod("razorpay")}
                icon={<CreditCard aria-hidden className="size-5 text-royal" />}
                title="Pay online"
                body="UPI (GPay, PhonePe, Paytm), debit/credit cards or net banking. Secured by Razorpay."
                badge={testMode ? "Test mode" : undefined}
              />
            ) : null}
            <MethodOption
              checked={method === "cod"}
              onSelect={() => setMethod("cod")}
              disabled={!settings.codEnabled}
              icon={<Banknote aria-hidden className="size-5 text-royal" />}
              title="Cash on delivery"
              body={settings.codEnabled ? "Our team calls you to confirm the order and delivery date." : "Cash on delivery is paused right now."}
            />
          </fieldset>
          {method === "razorpay" && testMode ? (
            <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
              Test mode: no real money is charged. Use Razorpay test cards or the test UPI ID success@razorpay.
            </p>
          ) : null}
          <label className="mt-4 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-deep">Note for our team (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. Call after 5 pm"
              className="w-full rounded-lg border px-3 py-2 text-base outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm"
            />
          </label>
        </section>
      </div>

      <aside className="h-fit rounded-2xl border p-5 lg:sticky lg:top-28">
        <h2 className="font-heading text-lg font-semibold text-deep">Order summary</h2>
        <ul className="mt-4 flex flex-col gap-3 text-sm">
          {items.map((i) => (
            <li key={i.variantId} className="flex justify-between gap-3">
              <span className="min-w-0 break-words text-deep">
                {i.productName}
                {i.variantName ? <span className="text-muted-foreground"> · {i.variantName}</span> : null}
                <span className="text-muted-foreground"> × {i.quantity}</span>
              </span>
              <span className="shrink-0 tabular">{formatPaise(i.price * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-2 border-t pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular">{formatPaise(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd className="tabular">{shipping ? formatPaise(shipping) : "Free"}</dd></div>
          <div className="flex justify-between border-t pt-3 text-base font-semibold text-deep"><dt>{method === "razorpay" ? "Total to pay now" : "Total (pay on delivery)"}</dt><dd className="tabular">{formatPaise(subtotal + shipping)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Ordering as {customer.name}{customer.code ? ` · ${customer.code}` : ""}. Prices are confirmed when you place the order.</p>
        {error ? (
          <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={place}
          disabled={pending || !addressId || (method === "cod" && !settings.codEnabled)}
          className="mt-4 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3.5 text-sm font-bold tracking-wide text-deep uppercase hover:bg-gold-300 disabled:opacity-60"
        >
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {pending ? (method === "razorpay" ? "Opening secure payment…" : "Placing order…") : method === "razorpay" ? <><Lock aria-hidden className="size-4" /> Pay {formatPaise(subtotal + shipping)}</> : "Place order"}
        </button>
        {!settings.codEnabled && !onlineEnabled ? <p className="mt-2 text-xs text-danger">Cash on delivery is paused. Please order on WhatsApp from your cart.</p> : null}
      </aside>
    </div>
  );
}

function MethodOption({
  checked,
  onSelect,
  disabled,
  icon,
  title,
  body,
  badge,
}: {
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
  body: string;
  badge?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-xl border p-4 text-sm",
        checked ? "border-royal bg-royal-50/60 ring-1 ring-royal" : "hover:border-royal/40",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input type="radio" name="payment" checked={checked} disabled={disabled} onChange={onSelect} className="mt-1 size-4 accent-royal" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 font-semibold text-deep">
          {icon} {title}
          {badge ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[0.7rem] font-semibold text-warning">{badge}</span> : null}
        </span>
        <span className="mt-1 block text-muted-foreground">{body}</span>
      </span>
    </label>
  );
}
