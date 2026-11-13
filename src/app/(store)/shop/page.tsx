import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";
import { ListingSkeleton } from "@/components/store/shop/listing-skeleton";
import { ProductListing } from "@/components/store/shop/product-listing";

export const metadata: Metadata = {
  title: "Shop All Kids' Rides & Toys",
  description: "Shop electric jeeps, cars, bikes, scooters, tricycles, cycles, toys and baby accessories at KING DAY.",
  alternates: { canonical: "/shop" },
};

export default function ShopPage({ searchParams }: PageProps<"/shop">) {
  return (
    <>
      <PageHero
        title="Shop"
        description="Every KING DAY ride and toy in one place. Filter by category, brand, price and availability."
        crumbs={[{ name: "Home", href: "/" }, { name: "Shop" }]}
      />
      <Container className="py-10 sm:py-12">
        <Suspense fallback={<ListingSkeleton />}>
          <ProductListing searchParams={searchParams} basePath="/shop" />
        </Suspense>
      </Container>
    </>
  );
}
