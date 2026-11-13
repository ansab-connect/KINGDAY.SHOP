import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Heart } from "lucide-react";
import { AccountShell } from "@/components/store/account/account-shell";
import { RemoveWishlistItem } from "@/components/store/account/account-forms";
import { ComingSoon } from "@/components/store/coming-soon";
import { Price } from "@/components/store/price";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { getWishlist } from "@/features/account/queries";
import { requireUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

async function WishlistContent() {
  await requireUser("/wishlist");
  const items = await getWishlist();
  return (
    <AccountShell active="/wishlist" title="My wishlist">
      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <Heart aria-hidden className="size-10 text-royal-300" />
          <p className="mt-4 font-heading text-lg font-semibold text-deep">Your wishlist is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">Tap “Wishlist” on any product to save it here.</p>
          <Link href="/shop" className="mt-6 rounded-full bg-royal px-5 py-2.5 text-sm font-semibold text-white">Browse products</Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => (
            <li key={i.product_id} className="flex flex-col overflow-hidden rounded-2xl border">
              <Link href={`/products/${i.slug}`} className="block aspect-[4/3] bg-muted">
                {i.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small list thumbnail
                  <img src={i.image} alt={i.name} className="size-full object-cover" loading="lazy" />
                ) : null}
              </Link>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <Link href={`/products/${i.slug}`} className="font-heading font-semibold text-deep hover:text-royal">{i.name}</Link>
                {i.price && i.mrp ? <Price price={i.price} mrp={i.mrp} /> : null}
                {!i.active ? <p className="text-xs text-muted-foreground">No longer available</p> : null}
                <div className="mt-auto"><RemoveWishlistItem productId={i.product_id} /></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}

export default function WishlistPage() {
  if (!isSupabaseConfigured) {
    return <ComingSoon icon={Heart} title="Your wishlist" body="Save your favourite rides once customer accounts are connected." />;
  }
  return (
    <Suspense fallback={<Container className="py-12"><Skeleton className="h-72 w-full rounded-2xl" /></Container>}>
      <WishlistContent />
    </Suspense>
  );
}
