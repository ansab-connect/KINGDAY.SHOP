import type { Metadata } from "next";
import { Suspense } from "react";
import { AddressBook } from "@/components/store/account/account-forms";
import { CheckoutView } from "@/components/store/checkout/checkout-view";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { getAddresses } from "@/features/account/queries";
import { requireUser } from "@/features/auth/session";
import { getCheckoutSettings } from "@/features/orders/checkout";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

async function Checkout() {
  if (!isSupabaseConfigured) return <p className="text-sm text-muted-foreground">Online ordering opens soon. Please order on WhatsApp from your cart.</p>;
  const user = await requireUser("/checkout");
  const supabase = await createClient();
  const [addresses, settings, { data: profile }] = await Promise.all([
    getAddresses(),
    getCheckoutSettings(),
    supabase.from("profiles").select("full_name, customer_code").eq("id", user.id).maybeSingle(),
  ]);
  const p = profile as { full_name: string | null; customer_code: string | null } | null;

  if (addresses.length === 0) {
    return (
      <div className="max-w-3xl">
        <h2 className="mb-1 font-heading text-lg font-semibold text-deep">Where should we deliver?</h2>
        <p className="mb-4 text-sm text-muted-foreground">Add a delivery address to continue. It is saved to your account for next time.</p>
        <AddressBook addresses={[]} />
      </div>
    );
  }
  return <CheckoutView addresses={addresses} settings={settings} customer={{ name: p?.full_name ?? user.fullName ?? "Customer", code: p?.customer_code ?? "" }} />;
}

export default function CheckoutPage() {
  return (
    <>
      <PageHero title="Checkout" crumbs={[{ name: "Home", href: "/" }, { name: "Cart", href: "/cart" }, { name: "Checkout" }]} />
      <Container className="py-10 sm:py-12">
        <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
          <Checkout />
        </Suspense>
      </Container>
    </>
  );
}
