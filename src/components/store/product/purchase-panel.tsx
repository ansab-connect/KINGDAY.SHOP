"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Mail, MessageCircle, Minus, Plus, ShoppingBag } from "lucide-react";
import { Price } from "@/components/store/price";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { WishlistButton } from "@/components/store/wishlist-button";
import { OFFICIAL_WHATSAPP, supportMailto, whatsappLink } from "@/config/storefront";
import { addToCart } from "@/features/cart/cart-store";
import { whatsappOrderUrl } from "@/lib/whatsapp";
import type { StoreVariant } from "@/features/catalog/types";
import { swatchFor } from "@/lib/colours";
import { cn } from "@/lib/utils";

type Props = {
  productId: string;
  name: string;
  shortDescription: string;
  variants: StoreVariant[];
  defaultVariantId: string;
  /** Digits-only WhatsApp number, or null when not configured. */
  whatsappNumber: string | null;
  productUrl: string;
};

/**
 * Variant / quantity selection and purchase actions. BUY NOW opens WhatsApp with
 * a pre-filled order message; the cart is kept in the browser. Prices shown are
 * display-only: online checkout (Phase 8) re-reads them from the database.
 */
export function PurchasePanel({ productId, name, shortDescription, variants, defaultVariantId, whatsappNumber, productUrl }: Props) {
  const [variantId, setVariantId] = useState(defaultVariantId);
  const [qty, setQty] = useState(1);
  const [notice, setNotice] = useState(false);
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const out = variant.stock <= 0;
  const maxQty = Math.max(1, Math.min(variant.stock, 5));
  const showPicker = variants.length > 1;
  const pickerLabel = variants.every((v) => v.colour) ? "Colour" : "Option";

  const waOrder = {
    name,
    sku: variant.sku,
    price: variant.price,
    variant: variants.length > 1 ? (variant.colour ?? variant.name) : null,
    quantity: qty,
    url: productUrl,
  };
  const buyHref = whatsappOrderUrl(whatsappNumber ?? OFFICIAL_WHATSAPP, waOrder);
  const enquireHref = whatsappLink(`Hi KING DAY, I have a question about ${name} (SKU ${variant.sku}). ${productUrl}`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Price price={variant.price} mrp={variant.mrp} size="lg" />
        <p className="mt-1 text-xs text-muted-foreground">
          MRP inclusive of all taxes · SKU <span className="font-medium text-deep">{variant.sku}</span>
        </p>
      </div>

      {shortDescription ? <p className="text-base leading-relaxed text-muted-foreground">{shortDescription}</p> : null}

      {showPicker ? (
        <fieldset>
          <legend className="text-sm font-medium text-deep">
            {pickerLabel}: <span className="font-normal text-muted-foreground">{variant.colour ?? variant.name}</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {variants.map((v) => {
              const swatch = swatchFor(v.colour);
              const label = v.colour ?? v.name;
              return (
                <label key={v.id} className="relative cursor-pointer" title={`${v.name}${v.stock <= 0 ? " (out of stock)" : ""}`}>
                  <input
                    type="radio"
                    name="variant"
                    value={v.id}
                    checked={variantId === v.id}
                    onChange={() => {
                      setVariantId(v.id);
                      setQty(1);
                    }}
                    className="peer sr-only"
                  />
                  {swatch ? (
                    <>
                      <span className="sr-only">{label}{v.stock <= 0 ? " (out of stock)" : ""}</span>
                      <span
                        aria-hidden
                        className={cn(
                          "block size-9 rounded-full ring-1 ring-black/10 ring-offset-2 transition-all peer-checked:ring-2 peer-checked:ring-royal peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                          v.stock <= 0 && "opacity-40",
                        )}
                        style={{ backgroundColor: swatch }}
                      />
                    </>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium text-deep transition-colors peer-checked:border-royal peer-checked:bg-royal-50 peer-checked:text-royal peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                        v.stock <= 0 && "text-muted-foreground line-through",
                      )}
                    >
                      {label}
                    </span>
                  )}
                </label>
              );
            })}
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
          {out ? "Out of stock" : variant.stock <= 5 ? `Only ${variant.stock} left` : "In stock, ready to ship"}
        </p>
      </div>

      <a
        href={out ? undefined : buyHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={out}
        data-testid="whatsapp-buy-now"
        className={cn(
          "inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-full bg-gold px-6 py-4 text-base font-bold tracking-wide text-deep uppercase shadow-[0_14px_34px_-14px_rgb(212_175_55/0.9)] transition-colors hover:bg-gold-300 focus-visible:ring-2 focus-visible:ring-royal focus-visible:outline-none",
          out && "pointer-events-none cursor-not-allowed opacity-50",
        )}
      >
        <WhatsAppIcon className="size-5" /> Buy now on WhatsApp
      </a>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={out}
          onClick={() => {
            addToCart({ variantId: variant.id, productName: name, variantName: variants.length > 1 ? (variant.colour ?? variant.name) : null, sku: variant.sku, price: variant.price, maxQty, url: productUrl }, qty);
            setNotice(true);
          }}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-royal px-6 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgb(75_0_130/0.6)] transition-colors hover:bg-royal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingBag aria-hidden className="size-4" /> Add to cart
        </button>
        <WishlistButton productId={productId} />
      </div>

      {notice ? (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 aria-hidden className="size-4 shrink-0" />
          Added to your cart.
          <Link href="/cart" className="font-semibold underline underline-offset-2">View cart</Link>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {enquireHref ? (
          <a href={enquireHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-5 text-sm font-semibold text-[#128C7E] hover:bg-[#25D366]/15">
            <MessageCircle aria-hidden className="size-4" /> Ask a question
          </a>
        ) : null}
        <a href={supportMailto(`Enquiry: ${name} (${variant.sku})`)} className="inline-flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold text-deep hover:bg-muted">
          <Mail aria-hidden className="size-4" /> Email support
        </a>
      </div>
    </div>
  );
}
