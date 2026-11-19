"use client";

import Link from "next/link";
import { Minus, Package, Plus, Trash2 } from "lucide-react";
import type { CartItem } from "@/features/cart/cart-store";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One product line: thumbnail, name, option, unit price, line total and a − / + stepper.
 * "−" at quantity 1 removes the line; the bin icon removes it at any quantity.
 */
export function CartLine({
  item: i,
  onQuantity,
  onRemove,
  compact = false,
}: {
  item: CartItem;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  const href = i.url.replace(/^https?:\/\/[^/]+/, "");
  const atMax = i.quantity >= i.maxQty;
  return (
    <li className={cn("flex gap-3", compact ? "py-3" : "p-4 sm:p-5")}>
      <Link
        href={href}
        className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted", compact ? "size-16" : "size-20 sm:size-24")}
        tabIndex={-1}
        aria-hidden
      >
        {i.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- small thumbnail from storage
          <img src={i.image} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <Package className="size-6 text-royal-300" />
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={href} className={cn("line-clamp-2 font-heading font-semibold break-words text-deep hover:text-royal", compact && "text-sm")}>
              {i.productName}
            </Link>
            <p className="text-xs text-muted-foreground">
              {i.variantName ? `${i.variantName} · ` : ""}
              {formatPaise(i.price)} each
            </p>
          </div>
          <span className={cn("shrink-0 font-semibold text-deep tabular", compact ? "text-sm" : "text-base")} aria-label={`Line total ${formatPaise(i.price * i.quantity)}`}>
            {formatPaise(i.price * i.quantity)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className={cn("flex items-center rounded-full border", compact ? "h-9" : "h-10")}>
            <button
              type="button"
              aria-label={i.quantity <= 1 ? `Remove ${i.productName}` : `Decrease quantity of ${i.productName}`}
              onClick={() => (i.quantity <= 1 ? onRemove() : onQuantity(i.quantity - 1))}
              className={cn("grid place-items-center rounded-full hover:bg-muted", compact ? "size-9" : "size-10", i.quantity <= 1 && "text-danger")}
            >
              {i.quantity <= 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
            </button>
            <output aria-live="polite" aria-label={`Quantity of ${i.productName}`} className="w-8 text-center text-sm font-semibold tabular">
              {i.quantity}
            </output>
            <button
              type="button"
              aria-label={`Increase quantity of ${i.productName}`}
              disabled={atMax}
              title={atMax ? `Only ${i.maxQty} available` : undefined}
              onClick={() => onQuantity(i.quantity + 1)}
              className={cn("grid place-items-center rounded-full hover:bg-muted disabled:opacity-40", compact ? "size-9" : "size-10")}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-danger hover:bg-danger-soft"
          >
            <Trash2 aria-hidden className="size-4" /> Remove
          </button>
        </div>
        {atMax && i.maxQty > 1 ? <p className="text-xs text-warning">Only {i.maxQty} available</p> : null}
      </div>
    </li>
  );
}
