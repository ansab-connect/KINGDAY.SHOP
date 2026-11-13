import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";
import { ListingSkeleton } from "@/components/store/shop/listing-skeleton";
import { ProductListing } from "@/components/store/shop/product-listing";

export const metadata: Metadata = {
  title: "Offers on Kids' Rides & Toys",
  description: "Current offers on KING DAY electric jeeps, bikes, scooters, toys and more.",
  alternates: { canonical: "/offers" },
};

export default function OffersPage({ searchParams }: PageProps<"/offers">) {
  return (
    <>
      <PageHero
        title="Offers"
        description="Selected rides and toys at 15% off or more, for a limited time."
        crumbs={[{ name: "Home", href: "/" }, { name: "Offers" }]}
      />
      <Container className="py-10 sm:py-12">
        <Suspense fallback={<ListingSkeleton />}>
          <ProductListing searchParams={searchParams} basePath="/offers" fixed={{ onOffer: true }} />
        </Suspense>
      </Container>
    </>
  );
}
