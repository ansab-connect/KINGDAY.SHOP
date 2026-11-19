import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Clock, CreditCard, XCircle } from "lucide-react";
import { PayAgainButton } from "@/components/store/checkout/pay-again";
import { Container } from "@/components/store/section";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { OFFICIAL_SUPPORT_EMAIL, OFFICIAL_WHATSAPP } from "@/config/storefront";
import { requireUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPaise } from "@/lib/format";
import { isRazorpayEnabled } from "@/lib/razorpay";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Complete payment", robots: { index: false } };

const EXPIRY_MS = 30 * 60_000;

/** Request-time hold window for an unpaid online order (stock is released after 30 minutes). */
function holdWindow(placedAt: string) {
  const left = Date.parse(placedAt) + EXPIRY_MS - Date.now();
  return { expired: left <= 0, minutesLeft: Math.max(1, Math.ceil(left / 60_000)) };
}

async function Payment({ searchParams }: PageProps<"/checkout/payment">) {
  const sp = await searchParams;
  const number = typeof sp.order === "string" && /^KD[0-9]{6,}$/.test(sp.order) ? sp.order : null;
  if (!isSupabaseConfigured || !number) notFound();
  await requireUser(`/checkout/payment?order=${number}`);
  const supabase = await createClient();
  // RLS: customers only see their own orders.
  const { data } = await supabase
    .from("orders")
    .select("order_number, grand_total, status, payment_method, payment_status, placed_at")
    .eq("order_number", number)
    .maybeSingle();
  if (!data) notFound();
  const o = data as { order_number: string; grand_total: number; status: string; payment_method: string; payment_status: string; placed_at: string };
  if (o.payment_status === "paid" || o.payment_method !== "razorpay") redirect(`/checkout/success?order=${o.order_number}`);

  const hold = holdWindow(o.placed_at);
  const expired = o.status !== "pending" || hold.expired;
  const failed = o.payment_status === "failed" || sp.failed === "1";
  const authorized = o.payment_status === "authorized";
  const wa = `https://wa.me/${OFFICIAL_WHATSAPP}?text=${encodeURIComponent(`Hi KING DAY, I need help paying for order ${o.order_number}.`)}`;
  const minutesLeft = hold.minutesLeft;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border bg-white p-6 text-center shadow-card sm:p-10">
      {expired ? (
        <XCircle aria-hidden className="size-14 text-danger" />
      ) : authorized ? (
        <Clock aria-hidden className="size-14 text-warning" />
      ) : failed ? (
        <XCircle aria-hidden className="size-14 text-danger" />
      ) : (
        <CreditCard aria-hidden className="size-14 text-royal" />
      )}
      <h1 className="mt-4 font-heading text-2xl font-bold text-deep">
        {expired ? "This order has expired" : authorized ? "Confirming your payment" : failed ? "Payment didn't go through" : "Complete your payment"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Order <span className="font-semibold text-deep">{o.order_number}</span> · {formatPaise(o.grand_total)}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {expired
          ? "It wasn't paid within 30 minutes, so the items were released. If money was deducted, it is refunded automatically by your bank in 5–7 days."
          : authorized
            ? "Your bank has approved the payment. We're confirming it now — refresh in a minute."
            : failed
              ? "No money was taken for the failed attempt. You can try again with UPI, a card or net banking."
              : `Your items are held for about ${minutesLeft} more minute${minutesLeft === 1 ? "" : "s"}.`}
      </p>

      <div className="mt-6 flex w-full flex-col gap-3">
        {!expired && !authorized && isRazorpayEnabled() ? <PayAgainButton orderNumber={o.order_number} amount={o.grand_total} /> : null}
        {expired ? (
          <Link href="/shop" className="inline-flex h-11 items-center justify-center rounded-full bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800">
            Shop again
          </Link>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/account/orders" className="inline-flex h-11 items-center justify-center rounded-full border px-5 text-sm font-semibold text-deep hover:bg-muted">
            My orders
          </Link>
          <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold text-deep hover:bg-muted">
            <WhatsAppIcon className="size-4" /> Get help
          </a>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Support: <a href={`mailto:${OFFICIAL_SUPPORT_EMAIL}?subject=${encodeURIComponent(`Payment for ${o.order_number}`)}`} className="font-medium text-royal hover:underline">{OFFICIAL_SUPPORT_EMAIL}</a>
      </p>
    </div>
  );
}

export default function CheckoutPaymentPage(props: PageProps<"/checkout/payment">) {
  return (
    <Container className="py-10 sm:py-16">
      <Suspense fallback={<Skeleton className="mx-auto h-80 max-w-lg rounded-2xl" />}>
        <Payment {...props} />
      </Suspense>
    </Container>
  );
}
