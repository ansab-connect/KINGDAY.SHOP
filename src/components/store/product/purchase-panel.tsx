"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Info, MessageCircle, Minus, Plus, ShoppingBag, Zap } from "lucide-react";
import { Price } from "@/components/store/price";
import type { StoreVariant } from "@/features/catalog/types";
import { swatchFor } from "@/lib/colours";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  shortDescription: string;
  variants: StoreVariant[];
  defaultVariantId: string;
  /** Digits-only WhatsApp number, or null when not configured. */
  whatsappNumber: string | null;
  productUrl: string;
};

/**
 * Variant / quantity selection and purchase actions. The displayed price follows
 * the selected variant, but it is display-only: checkout (Phase 8) re-reads the
 * price for the variant ID from the database.
 */
export function PurchasePanel({ name, shortDescription, variants, defaultVariantId, whatsappNumber, productUrl }: Props) {
  const [variantId, setVariantId] = useState(defaultVariantId);
  const [qty, setQty] = useState(1);
  const [notice, setNotice] = useState(false);
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const out = variant.stock <= 0;
  const maxQty = Math.max(1, Math.min(variant.stock, 5));
  const showPicker = variants.length > 1;
  const pickerLabel = variants.every((v) => v.colour) ? "Colour" : "Option";

  const waMessage = `Hi KING DAY, I'm interested in ${name} (${variant.name}, SKU ${variant.sku}), quantity ${qty}. ${productUrl}`;
  const waHref = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(waMessage)}` : null;

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

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={out}
          onClick={() => setNotice(true)}
          className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-royal px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgb(75_0_130/0.6)] transition-colors hover:bg-royal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingBag aria-hidden className="size-4" /> Add to cart
        </button>
        <button
          type="button"
          disabled={out}
          onClick={() => setNotice(true)}
          className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-gold px-6 py-3.5 text-sm font-semibold text-deep transition-colors hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Zap aria-hidden className="size-4" /> Buy now
        </button>
      </div>

      {notice ? (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-royal-50 px-4 py-3 text-sm text-royal-800">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          Online ordering opens at launch. Until then, enquire on WhatsApp and our team will help you order.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {waHref ? (
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-5 text-sm font-semibold text-[#128C7E] hover:bg-[#25D366]/15">
            <MessageCircle aria-hidden className="size-4" /> Enquire on WhatsApp
          </a>
        ) : (
          <Link href="/contact" className="inline-flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold text-deep hover:bg-muted">
            <MessageCircle aria-hidden className="size-4" /> Ask about this product
          </Link>
        )}
        <Link href="/wishlist" className="inline-flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold text-deep hover:bg-muted">
          <Heart aria-hidden className="size-4" /> Wishlist
        </Link>
      </div>
    </div>
  );
}
