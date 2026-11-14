import type { Metadata } from "next";
import { Suspense } from "react";
import { CartView } from "@/components/store/cart-view";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cart", robots: { index: false } };

/** Signed-in customers order under their Customer ID; first-time buyers register on this page. */
async function Cart() {
  if (!isSupabaseConfigured) return <CartView customer={null} accounts={false} />;
  const user = await getCurrentUser();
  if (!user) return <CartView customer={null} />;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name, phone, customer_code").eq("id", user.id).maybeSingle();
  const p = data as { full_name: string | null; phone: string | null; customer_code: string | null } | null;
  return <CartView customer={{ name: p?.full_name ?? user.fullName ?? "Customer", code: p?.customer_code ?? "", mobile: p?.phone ?? null }} />;
}

export default function CartPage() {
  return (
    <>
      <PageHero title="Your cart" crumbs={[{ name: "Home", href: "/" }, { name: "Cart" }]} />
      <Container className="py-10 sm:py-12">
        <Suspense fallback={<Skeleton className="h-72 rounded-2xl" />}>
          <Cart />
        </Suspense>
      </Container>
    </>
  );
}
