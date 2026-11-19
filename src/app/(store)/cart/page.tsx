import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShoppingBag, Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { CartView } from "@/components/store/cart-view";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";
import { ServiceCartSection } from "@/components/store/service/service-cart-section";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/features/auth/session";
import { getCheckoutSettings } from "@/features/orders/checkout";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cart", robots: { index: false } };

/** Products tab: signed-in customers check out under their Customer ID; first-time buyers register here. */
async function ProductCart() {
  if (!isSupabaseConfigured) return <CartView customer={null} accounts={false} />;
  const [user, settings] = await Promise.all([getCurrentUser(), getCheckoutSettings()]);
  const delivery = { flatShipping: settings.flatShipping, freeShippingAbove: settings.freeShippingAbove };
  if (!user) return <CartView customer={null} delivery={delivery} />;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name, phone, customer_code").eq("id", user.id).maybeSingle();
  const p = data as { full_name: string | null; phone: string | null; customer_code: string | null } | null;
  return <CartView customer={{ name: p?.full_name ?? user.fullName ?? "Customer", code: p?.customer_code ?? "", mobile: p?.phone ?? null }} delivery={delivery} />;
}

const TABS = [
  { key: "products", en: "Products", ml: "ഉൽപ്പന്നങ്ങൾ", icon: ShoppingBag, href: "/cart" },
  { key: "services", en: "Services", ml: "സർവീസുകൾ", icon: Wrench, href: "/cart?tab=services" },
] as const;

async function CartTabs({ searchParams }: PageProps<"/cart">) {
  const tab = (await searchParams).tab === "services" ? "services" : "products";
  return (
    <>
      <nav aria-label="Cart type" className="mb-6 grid w-full max-w-sm grid-cols-2 gap-1 rounded-full bg-muted p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-full text-sm font-semibold",
              tab === t.key ? "bg-white text-royal shadow-sm" : "text-muted-foreground hover:text-deep",
            )}
          >
            <t.icon aria-hidden className="size-4" /> <L en={t.en} ml={t.ml} />
          </Link>
        ))}
      </nav>
      <p className="mb-4 text-sm text-muted-foreground">
        {tab === "products" ? (
          <L en="Products you're buying. Checkout creates a product order." ml="നിങ്ങൾ വാങ്ങുന്ന ഉൽപ്പന്നങ്ങൾ." />
        ) : (
          <L en="Service bookings waiting to be sent. Checkout books the service; nothing is charged now." ml="അയയ്ക്കാനുള്ള സർവീസ് ബുക്കിംഗുകൾ." />
        )}
      </p>
      {tab === "products" ? <ProductCart /> : <ServiceCartSection />}
    </>
  );
}

export default function CartPage(props: PageProps<"/cart">) {
  return (
    <>
      <PageHero title="Your cart" crumbs={[{ name: "Home", href: "/" }, { name: "Cart" }]} />
      <Container className="py-8 sm:py-12">
        <Suspense fallback={<Skeleton className="h-72 rounded-2xl" />}>
          <CartTabs {...props} />
        </Suspense>
      </Container>
    </>
  );
}
