import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/store/page-hero";
import { ProductVisual } from "@/components/store/product-visual";
import { Container } from "@/components/store/section";
import { getCategories } from "@/features/catalog/queries";

export const metadata: Metadata = {
  title: "Shop by Category",
  description: "Browse KING DAY categories: electric jeeps & cars, bikes, scooters, tricycles, cycles, toys and baby accessories.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const categories = await getCategories();
  return (
    <>
      <PageHero
        title="Categories"
        description="From a toddler's first trike to a 4x4 electric jeep, find the right ride for every age."
        crumbs={[{ name: "Home", href: "/" }, { name: "Categories" }]}
      />
      <Container className="py-10 sm:py-14">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/categories/${c.slug}`} className="group block overflow-hidden rounded-2xl border bg-white transition-shadow duration-500 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <ProductVisual categorySlug={c.slug} className="aspect-[16/10]" iconClassName="size-[24%] transition-transform duration-500 ease-royal group-hover:scale-110" />
                <div className="flex items-start justify-between gap-4 p-5">
                  <div>
                    <h2 className="font-heading text-lg font-bold text-deep">{c.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                    <p className="mt-3 text-xs font-semibold text-royal">{c.productCount} products</p>
                  </div>
                  <ArrowRight aria-hidden className="mt-1 size-5 shrink-0 text-royal-300 transition-transform group-hover:translate-x-1 group-hover:text-royal" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
