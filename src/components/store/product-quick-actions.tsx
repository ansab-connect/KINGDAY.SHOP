"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Heart, Plus } from "lucide-react";
import { toggleWishlistAction } from "@/features/account/actions";
import { addToCart } from "@/features/cart/cart-store";
import { cn } from "@/lib/utils";

/** Heart on a product card. Guests are sent to sign in. */
export function CardWishlist({ productId, name }: { productId: string; name: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await toggleWishlistAction(productId);
          if (r.ok) setSaved(Boolean(r.saved));
          else if (r.error === "signin") router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        })
      }
      className="relative z-10 grid size-9 place-items-center rounded-full bg-white/90 text-deep shadow-sm backdrop-blur hover:text-danger"
    >
      <Heart aria-hidden className={cn("size-4", saved && "fill-danger text-danger")} />
    </button>
  );
}

type QuickItem = { variantId: string; productName: string; sku: string; price: number; maxQty: number; url: string; image?: string | null };

/** One-tap "Add" for single-option products that are in stock. */
export function CardQuickAdd({ item }: { item: QuickItem }) {
  const [added, setAdded] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Add ${item.productName} to cart`}
      onClick={() => {
        addToCart({ ...item, variantName: null }, 1);
        setAdded(true);
        setTimeout(() => setAdded(false), 1800);
      }}
      className={cn(
        "relative z-10 inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-bold transition-colors",
        added ? "bg-success text-white" : "bg-royal text-white hover:bg-royal-800",
      )}
    >
      {added ? <Check aria-hidden className="size-3.5" /> : <Plus aria-hidden className="size-3.5" />}
      {added ? "Added" : "Add"}
    </button>
  );
}
