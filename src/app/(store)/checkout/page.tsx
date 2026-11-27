import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutView } from "@/components/store/checkout/checkout-view";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { getAddresses } from "@/features/account/queries";
import { requireUser } from "@/features/auth/session";
import { getCheckoutSettings } from "@/features/orders/checkout";
import { isSupabaseConfigured } from "@/lib/env";
import { getRazorpayConfig } from "@/lib/razorpay";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

async function Checkout({ buyNow, pay }: { buyNow: boolean; pay?: "razorpay" | "cod" }) {
  if (!isSupabaseConfigured) return <p className="text-sm text-muted-foreground">Online ordering opens soon. Please order on WhatsApp from your cart.</p>;
  const user = await requireUser(buyNow ? `/checkout?buy=1${pay ? `&pay=${pay === "cod" ? "cod" : "online"}` : ""}` : "/checkout");
  const supabase = await createClient();
  const [addresses, settings, { data: profile }] = await Promise.all([
    getAddresses(),
    getCheckoutSettings(),
    supabase.from("profiles").select("full_name, customer_code, phone").eq("id", user.id).maybeSingle(),
  ]);
  const p = profile as { full_name: string | null; customer_code: string | null; phone: string | null } | null;

  const rzp = getRazorpayConfig();
  return (
    <CheckoutView
      addresses={addresses}
      settings={settings}
      customer={{ name: p?.full_name ?? user.fullName ?? "Customer", code: p?.customer_code ?? "", phone: p?.phone ?? "" }}
      onlineEnabled={rzp !== null}
      testMode={rzp?.mode === "test"}
      mode={buyNow ? "buynow" : "cart"}
      initialMethod={pay}
    />
  );
}

async function CheckoutFromParams({ searchParams }: { searchParams: PageProps<"/checkout">["searchParams"] }) {
  const q = await searchParams;
  return <Checkout buyNow={q.buy === "1"} pay={q.pay === "cod" ? "cod" : q.pay === "online" ? "razorpay" : undefined} />;
}

export default function CheckoutPage(props: PageProps<"/checkout">) {
  return (
    <>
      <PageHero title="Checkout" crumbs={[{ name: "Home", href: "/" }, { name: "Cart", href: "/cart" }, { name: "Checkout" }]} />
      <Container className="py-10 sm:py-12">
        <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
          <CheckoutFromParams searchParams={props.searchParams} />
        </Suspense>
      </Container>
    </>
  );
}
