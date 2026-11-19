import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2 } from "lucide-react";
import { Container } from "@/components/store/section";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { OFFICIAL_WHATSAPP } from "@/config/storefront";
import { requireUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPaise } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Order placed", robots: { index: false } };

async function Success({ searchParams }: PageProps<"/checkout/success">) {
  const raw = (await searchParams).order;
  const number = typeof raw === "string" && /^KD[0-9]{6,}$/.test(raw) ? raw : null;
  if (!isSupabaseConfigured || !number) notFound();
  await requireUser("/account/orders");
  const supabase = await createClient();
  // RLS: customers can only read their own orders.
  const { data } = await supabase
    .from("orders")
    .select("order_number, grand_total, customer_name, payment_method, payment_status")
    .eq("order_number", number)
    .maybeSingle();
  if (!data) notFound();
  const o = data as { order_number: string; grand_total: number; customer_name: string; payment_method: string; payment_status: string };
  const online = o.payment_method === "razorpay";
  // Online orders only reach this page once the server has recorded the payment.
  if (online && o.payment_status !== "paid") redirect(`/checkout/payment?order=${o.order_number}`);
  const message = `Hi KING DAY, I just placed order ${o.order_number} (${formatPaise(o.grand_total)}, ${online ? "paid online" : "cash on delivery"}).`;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border bg-white p-6 text-center shadow-card sm:p-10">
      <CheckCircle2 aria-hidden className="size-14 text-success" />
      <h1 className="mt-4 font-heading text-2xl font-bold text-deep">Thank you, your order is placed!</h1>
      <p className="mt-2 text-muted-foreground">
        Order <span className="font-semibold text-deep">{o.order_number}</span> · {formatPaise(o.grand_total)} {online ? "paid online" : "to pay on delivery"}.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {online ? "Payment received and your order is confirmed. We'll update you when it ships." : "Our team will call you to confirm the delivery date."}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Questions? <a href="mailto:kingdaystore@gmail.com" className="font-medium text-royal hover:underline">kingdaystore@gmail.com</a>
      </p>
      <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/account/orders" className="inline-flex h-11 items-center justify-center rounded-full bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800">
          View my orders
        </Link>
        <a
          href={`https://wa.me/${OFFICIAL_WHATSAPP}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold text-deep hover:bg-muted"
        >
          <WhatsAppIcon className="size-4" /> Message us on WhatsApp
        </a>
      </div>
      <Link href="/shop" className="mt-4 text-sm text-muted-foreground hover:text-royal">Continue shopping</Link>
    </div>
  );
}

export default function OrderSuccessPage(props: PageProps<"/checkout/success">) {
  return (
    <Container className="py-10 sm:py-16">
      <Suspense fallback={<Skeleton className="mx-auto h-80 max-w-lg rounded-2xl" />}>
        <Success {...props} />
      </Suspense>
    </Container>
  );
}
