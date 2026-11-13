"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, Loader2 } from "lucide-react";
import { toggleWishlistAction } from "@/features/account/actions";
import { cn } from "@/lib/utils";

/** Save / unsave a product. Guests are sent to sign in first. */
export function WishlistButton({ productId, initiallySaved = false }: { productId: string; initiallySaved?: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-pressed={saved}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await toggleWishlistAction(productId);
            if (r.ok) {
              setSaved(Boolean(r.saved));
              setMsg(r.saved ? "Saved to your wishlist." : "Removed from your wishlist.");
            } else if (r.error === "signin") {
              router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
            } else {
              setMsg(r.error ?? "Couldn't update your wishlist.");
            }
          })
        }
        className={cn(
          "inline-flex h-12 items-center justify-center gap-2 rounded-full border px-6 text-sm font-semibold transition-colors disabled:opacity-60",
          saved ? "border-royal bg-royal-50 text-royal" : "text-deep hover:bg-muted",
        )}
      >
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Heart aria-hidden className={cn("size-4", saved && "fill-royal")} />}
        {saved ? "Saved" : "Wishlist"}
      </button>
      {msg ? <p role="status" className="mt-1.5 text-center text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
