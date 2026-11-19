"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Mail, MessageCircle, Minus, Plus, ShoppingBag, Zap } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { Price } from "@/components/store/price";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { WishlistButton } from "@/components/store/wishlist-button";
import { useVariantSelection } from "@/components/store/product/variant-selection";
import { OFFICIAL_WHATSAPP, supportMailto, whatsappLink } from "@/config/storefront";
import { addToCart, startBuyNow } from "@/features/cart/cart-store";
import { whatsappOrderUrl } from "@/lib/whatsapp";
import { formatPaise } from "@/lib/format";
import type { StoreVariant } from "@/features/catalog/types";
import { swatchFor } from "@/lib/colours";
import { cn } from "@/lib/utils";

type Props = {
  productId: string;
  name: string;
  shortDescription: string;
  /** Main variant type (e.g. "Size"), or null for a simple variant list. */
  option1Name: string | null;
  /** Sub variant type under each main value (e.g. "Colour"). */
  option2Name: string | null;
  /** Product image used for the cart thumbnail when the variant has none of its own. */
  fallbackImage?: string | null;
  /** Digits-only WhatsApp number, or null when not configured. */
  whatsappNumber: string | null;
  productUrl: string;
};

/**
 * Variant / quantity selection and purchase actions. BUY NOW opens WhatsApp with
 * a pre-filled order message; the cart is kept in the browser. Prices shown are
 * display-only: online checkout (Phase 8) re-reads them from the database.
 */
export function PurchasePanel({ productId, name, shortDescription, option1Name, option2Name, fallbackImage = null, whatsappNumber, productUrl }: Props) {
  const { variants, variant, select } = useVariantSelection();
  const [qty, setQty] = useState(1);
  const [notice, setNotice] = useState(false);
  const router = useRouter();
  const out = variant.stock <= 0;
  const maxQty = Math.max(1, Math.min(variant.stock, 5));
  const choose = (id: string) => {
    select(id);
    setQty(1);
    setNotice(false);
  };
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

  // Main values in display order, and the sub values available for the chosen main value.
  const mainValues = option1Name
    ? [...new Map(variants.filter((v) => v.option1).map((v) => [v.option1!.toLowerCase(), v.option1!])).values()]
    : [];
  const sameMain = (v: StoreVariant, value: string | null) => (v.option1 ?? "").toLowerCase() === (value ?? "").toLowerCase();
  const subChoices = option2Name ? variants.filter((v) => sameMain(v, variant.option1) && v.option2) : [];
  const pickMain = (value: string) => {
    const group = variants.filter((v) => sameMain(v, value));
    const next =
      group.find((v) => v.option2 && variant.option2 && v.option2.toLowerCase() === variant.option2.toLowerCase() && v.stock > 0) ??
      group.find((v) => v.stock > 0) ??
      group[0];
    if (next) choose(next.id);
  };

  const waOrder = {
    name,
    sku: variant.sku,
    price: variant.price,
    variant: variantLabel,
    quantity: qty,
    url: productUrl,
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

      {option1Name && mainValues.length ? (
        <fieldset>
          <legend className="text-sm font-medium text-deep">
            {option1Name}: <span className="font-normal text-muted-foreground">{variant.option1}</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {mainValues.map((value) => {
              const group = variants.filter((v) => sameMain(v, value));
              const soldOut = group.every((v) => v.stock <= 0);
              const one = !option2Name ? group[0] : null;
              return (
                <Choice
                  key={value}
                  name="option1"
                  label={value}
                  checked={sameMain(variant, value)}
                  soldOut={soldOut}
                  swatch={/colou?r/i.test(option1Name) ? swatchFor(value) : null}
                  onSelect={() => (one ? choose(one.id) : pickMain(value))}
                />
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {option2Name && subChoices.length ? (
        <fieldset>
          <legend className="text-sm font-medium text-deep">
            {option2Name}: <span className="font-normal text-muted-foreground">{variant.option2}</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {subChoices.map((v) => (
              <Choice
                key={v.id}
                name="option2"
                label={v.option2!}
                checked={v.id === variant.id}
                soldOut={v.stock <= 0}
                swatch={/colou?r/i.test(option2Name) ? swatchFor(v.option2) : null}
                onSelect={() => choose(v.id)}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      {!option1Name && variants.length > 1 ? (
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

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-12 items-center rounded-full border">
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

      <button
        type="button"
        disabled={out}
        onClick={() => {
          // Checkout shows exactly this product at this quantity; the cart is not touched.
          startBuyNow(lineItem, qty);
          router.push("/checkout?buy=1");
        }}
        className="inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-full bg-gold px-6 py-4 text-base font-bold tracking-wide text-deep uppercase shadow-[0_14px_34px_-14px_rgb(212_175_55/0.9)] transition-colors hover:bg-gold-300 focus-visible:ring-2 focus-visible:ring-royal focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Zap aria-hidden className="size-5" /> <L en="Buy now" ml="ഇപ്പോൾ വാങ്ങൂ" />
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={out}
          onClick={() => {
            addToCart(lineItem, qty);
            setNotice(true);
          }}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-royal px-6 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgb(75_0_130/0.6)] transition-colors hover:bg-royal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingBag aria-hidden className="size-4" /> <L en="Add to cart" ml="കാർട്ടിൽ ചേർക്കുക" />
        </button>
        <WishlistButton productId={productId} />
      </div>

      {notice ? (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 aria-hidden className="size-4 shrink-0" />
          <L en="Added to your cart." ml="കാർട്ടിൽ ചേർത്തു." />
          <Link href="/cart" className="font-semibold underline underline-offset-2"><L en="View cart" ml="കാർട്ട് കാണുക" /></Link>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {!out ? (
          <a
            href={buyHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="whatsapp-buy-now"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-white hover:bg-[#1fb857]"
          >
            <WhatsAppIcon className="size-4" /> <L en="Order on WhatsApp" ml="WhatsApp-ൽ ഓർഡർ" />
          </a>
        ) : null}
        {enquireHref ? (
          <a href={enquireHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-5 text-sm font-semibold text-[#128C7E] hover:bg-[#25D366]/15">
            <MessageCircle aria-hidden className="size-4" /> <L en="Ask a question" ml="ചോദ്യം ചോദിക്കുക" />
          </a>
        ) : null}
        <a href={supportMailto(`Enquiry: ${name}`)} className="inline-flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold text-deep hover:bg-muted">
          <Mail aria-hidden className="size-4" /> <L en="Email support" ml="ഇമെയിൽ സഹായം" />
        </a>
      </div>
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
