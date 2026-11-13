import type { Metadata } from "next";
import { CartView } from "@/components/store/cart-view";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";

export const metadata: Metadata = { title: "Cart", robots: { index: false } };

export default function CartPage() {
  return (
    <>
      <PageHero title="Your cart" crumbs={[{ name: "Home", href: "/" }, { name: "Cart" }]} />
      <Container className="py-10 sm:py-12">
        <CartView />
      </Container>
    </>
  );
}
