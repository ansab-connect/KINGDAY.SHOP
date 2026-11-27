"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Lock, Mail, MessageCircle, Minus, Plus, ShoppingBag, Zap } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { Price } from "@/components/store/price";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { WishlistButton } from "@/components/store/wishlist-button";
import { useVariantSelection } from "@/components/store/product/variant-selection";
import { OFFICIAL_WHATSAPP, supportMailto, whatsappLink } from "@/config/storefront";
import { addToCart, startBuyNow } from "@/features/cart/cart-store";
import { estimateTotals, type PriceSettings } from "@/features/orders/pricing";
import { contentParams, track } from "@/lib/meta-pixel";
import { whatsappOrderUrl } from "@/lib/whatsapp";
import { formatPaise } from "@/lib/format";
import type { StoreVariant } from "@/features/catalog/types";
import { swatchFor } from "@/lib/colours";
import { cn } from "@/lib/utils";

type Props = {
  productId: string;
  name: string;
  shortDescription: string;
  /** Kept for callers; the choices themselves render in <VariantOptions> under the photos. */
  variantTypes?: string[];
  /** Product image used for the cart thumbnail when the variant has none of its own. */
  fallbackImage?: string | null;
  /** Digits-only WhatsApp number, or null when not configured. */
  whatsappNumber: string | null;
  productUrl: string;
  /** % off when paid online / cash on delivery (set per product in admin). */
  prepaidPct: number;
  codPct: number;
  settings: PriceSettings & { codEnabled: boolean };
};

/**
 * Variant / quantity selection and purchase actions. BUY NOW opens WhatsApp with
 * a pre-filled order message; the cart is kept in the browser. Prices shown are
 * display-only: online checkout (Phase 8) re-reads them from the database.
 */
export function PurchasePanel({ productId, name, shortDescription, fallbackImage = null, whatsappNumber, productUrl, prepaidPct, codPct, settings }: Props) {
  const { variants, variant } = useVariantSelection();
  // Quantity resets to 1 whenever a different variant is chosen (picker lives under the photos).
  const [qtyState, setQtyState] = useState({ id: variant.id, n: 1 });
  const qty = qtyState.id === variant.id ? qtyState.n : 1;
  const setQty = (f: (n: number) => number) => setQtyState({ id: variant.id, n: f(qty) });
  const router = useRouter();
  const buyRef = useRef<HTMLButtonElement>(null);
  // ViewContent once per product page (not on re-renders or variant changes).
  const viewed = useRef<string | null>(null);
  useEffect(() => {
    if (viewed.current === productId) return;
    viewed.current = productId;
    track("ViewContent", contentParams([{ id: variant.sku, name, price: variant.price, quantity: 1 }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);
  const [buyVisible, setBuyVisible] = useState(true);
  useEffect(() => {
    const el = buyRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Hidden only once the main button has scrolled up out of view.
    const io = new IntersectionObserver(([e]) => setBuyVisible(e.isIntersecting || e.boundingClientRect.top > 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const out = variant.stock <= 0;
  const maxQty = Math.max(1, Math.min(variant.stock, 5));
  const variantLabel = variants.length > 1 && variant.name !== "Default" ? variant.name : null;
  const lineItem = {
    variantId: variant.id,
    productName: name,
    variantName: variantLabel,
    sku: variant.sku,
    price: variant.price,
    maxQty,
    url: productUrl,
    image: variant.images[0]?.src ?? fallbackImage,
  };

  const prepaid = estimateTotals(variant.price, qty, prepaidPct, true, settings);
  const cod = estimateTotals(variant.price, qty, codPct, false, settings);
  // Both go to checkout with only this product; the payment method is pre-selected there.
  const buy = (pay: "online" | "cod") => {
    startBuyNow(lineItem, qty);
    router.push(`/checkout?buy=1&pay=${pay}`);
  };
  const waOrder = {
    name,
    sku: variant.sku,
    price: variant.price,
    variant: variantLabel,
    quantity: qty,
    url: productUrl,
    total: cod.total,
  };
  const buyHref = whatsappOrderUrl(whatsappNumber ?? OFFICIAL_WHATSAPP, waOrder);
  const enquireHref = whatsappLink(`Hi KING DAY, I have a question about ${name} ${productUrl}`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Price price={variant.price} mrp={variant.mrp} size="lg" />
        {variant.mrp > variant.price ? (
          <p className="mt-1 text-sm font-semibold text-success">
            <L en={`You save ${formatPaise(variant.mrp - variant.price)}`} ml={`നിങ്ങൾക്ക് ${formatPaise(variant.mrp - variant.price)} ലാഭം`} />
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          <L en="MRP inclusive of all taxes" ml="എല്ലാ നികുതികളും ഉൾപ്പെടെ" /> · SKU <span className="font-medium text-deep" aria-live="polite">{variant.sku}</span>
        </p>
      </div>

      {shortDescription ? <p className="text-base leading-relaxed text-muted-foreground">{shortDescription}</p> : null}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-12 items-center rounded-full border bg-white">
          <button type="button" aria-label="Decrease quantity" disabled={qty <= 1 || out} onClick={() => setQty((q) => q - 1)} className="grid size-12 place-items-center rounded-full text-deep hover:bg-muted disabled:opacity-40">
            <Minus className="size-4" />
          </button>
          <output aria-live="polite" aria-label="Quantity" className="w-8 text-center font-semibold tabular">{qty}</output>
          <button type="button" aria-label="Increase quantity" disabled={qty >= maxQty || out} onClick={() => setQty((q) => q + 1)} className="grid size-12 place-items-center rounded-full text-deep hover:bg-muted disabled:opacity-40">
            <Plus className="size-4" />
          </button>
        </div>
        <p className={cn("text-sm font-medium", out ? "text-danger" : variant.stock <= 5 ? "text-warning" : "text-success")}>
          {out ? <L en="Out of stock" ml="സ്റ്റോക്ക് ഇല്ല" /> : variant.stock <= 5 ? <L en={`Only ${variant.stock} left`} ml={`${variant.stock} എണ്ണം മാത്രം ബാക്കി`} /> : <L en="In stock, ready to ship" ml="സ്റ്റോക്കുണ്ട്, ഉടൻ അയയ്ക്കാം" />}
        </p>
      </div>

      {!out ? (
        <dl className="rounded-2xl border border-royal-100 bg-royal-50/40 p-4 text-sm" aria-live="polite" aria-label="Price if you pay online">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal ({qty} item{qty === 1 ? "" : "s"})</dt><dd className="tabular">{formatPaise(prepaid.subtotal)}</dd></div>
          {prepaid.discount ? (
            <div className="mt-1.5 flex justify-between text-success"><dt>Prepaid discount ({prepaidPct}%)</dt><dd className="tabular">−{formatPaise(prepaid.discount)}</dd></div>
          ) : null}
          <div className="mt-1.5 flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd className="tabular">{prepaid.shipping ? formatPaise(prepaid.shipping) : <span className="font-semibold text-success">Free</span>}</dd></div>
          <div className="mt-2 flex justify-between border-t border-royal-100 pt-2 text-base font-bold text-deep"><dt>You pay online</dt><dd className="tabular">{formatPaise(prepaid.total)}</dd></div>
        </dl>
      ) : null}

      <div className="flex flex-col gap-3">
        {/* Buy now: the one bold, warm action on the page (orange stands out from the purple
            brand and the green WhatsApp button), price on the button, trust line below. */}
        <button
          ref={buyRef}
          type="button"
          disabled={out}
          onClick={() => buy("online")}
          className="buy-now-shine buy-now-glow group relative flex min-h-[4.5rem] w-full items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-b from-orange-500 to-orange-600 px-4 py-3 text-left text-white transition-[transform,background-color] hover:from-orange-600 hover:to-orange-700 active:scale-[0.99] focus-visible:ring-4 focus-visible:ring-orange-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/20 ring-1 ring-white/40">
            <Zap aria-hidden className="size-5 fill-white text-white transition-transform group-hover:scale-110" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg leading-tight font-extrabold tracking-wide uppercase">
              <L en="Buy now" ml="ഇപ്പോൾ വാങ്ങൂ" />
            </span>
            <span className="block truncate text-xs font-medium text-white/90">
              {prepaid.shipping ? "Pay online · UPI · Cards" : "Free delivery · Pay online"}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className="text-xl leading-tight font-extrabold tabular">{formatPaise(prepaid.total)}</span>
            {prepaid.discount ? (
              <span className="mt-0.5 rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-bold text-orange-700">Save {formatPaise(prepaid.discount)}</span>
            ) : null}
          </span>
        </button>
        <p className="-mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden className="size-3.5 text-success" /> Secure payment · UPI · Cards · Net banking
        </p>

        {settings.codEnabled ? (
          <button
            type="button"
            disabled={out}
            onClick={() => buy("cod")}
            className="flex min-h-14 w-full flex-col items-center justify-center rounded-2xl border-2 border-royal bg-white px-6 py-2.5 text-royal transition-colors hover:bg-royal-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
              <Banknote aria-hidden className="size-4" /> <L en="Cash on delivery" ml="ക്യാഷ് ഓൺ ഡെലിവറി" /> · <span className="tabular">{formatPaise(cod.total)}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {cod.shipping ? `Incl. ${formatPaise(cod.shipping)} delivery` : "Free delivery"}
              {cod.discount ? ` · Save ${formatPaise(cod.discount)}` : ""}
            </span>
          </button>
        ) : null}

        {!out ? (
          <a
            href={buyHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="whatsapp-buy-now"
            className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-6 text-sm font-bold text-white hover:bg-[#1fb857]"
          >
            <WhatsAppIcon className="size-5" /> <L en="Order on WhatsApp" ml="WhatsApp-ൽ ഓർഡർ" />
          </a>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={out}
          onClick={() => {
            addToCart(lineItem, qty);
          }}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border px-6 text-sm font-semibold text-deep transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingBag aria-hidden className="size-4" /> <L en="Add to cart" ml="കാർട്ടിൽ ചേർക്കുക" />
        </button>
        <WishlistButton productId={productId} />
      </div>


      <div className="flex flex-wrap gap-3">
        {enquireHref ? (
          <a href={enquireHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-4 text-sm font-semibold text-[#128C7E] hover:bg-[#25D366]/15">
            <MessageCircle aria-hidden className="size-4" /> <L en="Ask a question" ml="ചോദ്യം ചോദിക്കുക" />
          </a>
        ) : null}
        <a href={supportMailto(`Enquiry: ${name}`)} className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold text-deep hover:bg-muted">
          <Mail aria-hidden className="size-4" /> <L en="Email support" ml="ഇമെയിൽ സഹായം" />
        </a>
      </div>

      {/* Sticky mobile Buy Now (above the bottom menu) once the main button scrolls away. */}
      {!out && !buyVisible ? (
        <div className="fixed inset-x-0 bottom-[4.25rem] z-40 border-t bg-white/95 px-4 py-2.5 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur lg:hidden">
          <button type="button" onClick={() => buy("online")} className="buy-now-shine relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-orange-500 to-orange-600 text-sm font-extrabold tracking-wide text-white uppercase shadow-[0_10px_24px_-10px_rgb(234_88_12/0.8)]">
            <Zap aria-hidden className="size-4 fill-white text-white" /> Buy now · <span className="tabular">{formatPaise(prepaid.total)}</span>
            {prepaid.discount ? <span className="rounded-full bg-white px-2 py-0.5 text-[0.65rem] text-orange-700 normal-case">Save {formatPaise(prepaid.discount)}</span> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Colour / model / size choices. Rendered directly under the product photos (mobile and
 * desktop); choosing one updates the shared selection, so photos, price and stock follow.
 */
export function VariantOptions({ variantTypes }: { variantTypes: string[] }) {
  const { variants, variant, select } = useVariantSelection();
  const choose = (id: string) => select(id);
  // Cascading choice: each type only offers values that exist together with the values
  // already chosen for the types before it (size → its colours → their speeds…).
  const same = (x: string | undefined, y: string | undefined) => (x ?? "").toLowerCase() === (y ?? "").toLowerCase();
  const matchesUpTo = (v: StoreVariant, level: number) => variantTypes.slice(0, level).every((t) => same(v.values[t], variant.values[t]));
  const levels = variantTypes.map((t, level) => {
    const pool = variants.filter((v) => matchesUpTo(v, level) && v.values[t]);
    const values = [...new Map(pool.map((v) => [v.values[t].toLowerCase(), v.values[t]])).values()];
    return { type: t, level, values, pool };
  });
  const pick = (level: number, value: string) => {
    const t = variantTypes[level];
    const pool = variants.filter((v) => matchesUpTo(v, level) && same(v.values[t], value));
    // Keep the later choices when that combination exists; prefer something in stock.
    const score = (v: StoreVariant) => variantTypes.slice(level + 1).filter((x) => same(v.values[x], variant.values[x])).length * 2 + (v.stock > 0 ? 1 : 0);
    const next = [...pool].sort((a, b) => score(b) - score(a))[0];
    if (next) choose(next.id);
  };

  if (!(levels.some((l) => l.values.length) || (!variantTypes.length && variants.length > 1))) return null;
  return (
    <div className="flex flex-col gap-4">
      {levels.map(({ type, level, values, pool }) =>
        values.length ? (
          <fieldset key={type}>
            <legend className="text-sm font-medium text-deep">
              {type}: <span className="font-normal text-muted-foreground">{variant.values[type]}</span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {values.map((value) => (
                <Choice
                  key={value}
                  name={`option-${level}`}
                  label={value}
                  checked={same(variant.values[type], value)}
                  soldOut={pool.filter((v) => same(v.values[type], value)).every((v) => v.stock <= 0)}
                  swatch={/colou?r/i.test(type) ? swatchFor(value) : null}
                  onSelect={() => pick(level, value)}
                />
              ))}
            </div>
          </fieldset>
        ) : null,
      )}

      {!variantTypes.length && variants.length > 1 ? (
        <fieldset>
          <legend className="text-sm font-medium text-deep">
            {variants.every((v) => v.colour) ? "Colour" : "Option"}: <span className="font-normal text-muted-foreground">{variant.colour ?? variant.name}</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {variants.map((v) => (
              <Choice
                key={v.id}
                name="variant"
                label={v.colour ?? v.name}
                checked={v.id === variant.id}
                soldOut={v.stock <= 0}
                swatch={swatchFor(v.colour)}
                onSelect={() => choose(v.id)}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

    </div>
  );
}

/** One selectable value: a colour swatch, or a text chip. Sold-out values stay selectable but dimmed. */
function Choice({
  name,
  label,
  checked,
  soldOut,
  swatch,
  onSelect,
}: {
  name: string;
  label: string;
  checked: boolean;
  soldOut: boolean;
  swatch: string | null;
  onSelect: () => void;
}) {
  return (
    <label className="relative cursor-pointer" title={`${label}${soldOut ? " (out of stock)" : ""}`}>
      <input type="radio" name={name} value={label} checked={checked} onChange={onSelect} className="peer sr-only" />
      {swatch ? (
        <>
          <span className="sr-only">
            {label}
            {soldOut ? " (out of stock)" : ""}
          </span>
          <span
            aria-hidden
            className={cn(
              "block size-9 rounded-full ring-1 ring-black/10 ring-offset-2 transition-all peer-checked:ring-2 peer-checked:ring-royal peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
              soldOut && "opacity-40",
            )}
            style={{ backgroundColor: swatch }}
          />
        </>
      ) : (
        <span
          className={cn(
            "inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium text-deep transition-colors peer-checked:border-royal peer-checked:bg-royal-50 peer-checked:text-royal peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
            soldOut && "text-muted-foreground line-through",
          )}
        >
          {label}
        </span>
      )}
    </label>
  );
}
