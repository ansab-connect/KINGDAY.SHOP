import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";
import { ListingSkeleton } from "@/components/store/shop/listing-skeleton";
import { ProductListing } from "@/components/store/shop/product-listing";
import { getCategories, getCategoryBySlug } from "@/features/catalog/queries";

export function generateStaticParams() {
  return getCategories().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };
  return {
    title: `${category.name} for Kids`,
    description: `${category.description} Shop ${category.name.toLowerCase()} at KING DAY.`,
    alternates: { canonical: `/categories/${category.slug}` },
    openGraph: { title: `${category.name} | KING DAY`, description: category.description },
  };
}

async function CategoryContent({ params, searchParams }: Pick<PageProps<"/categories/[slug]">, "params" | "searchParams">) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  return (
    <>
      <PageHero
        title={category.name}
        description={category.description}
        crumbs={[{ name: "Home", href: "/" }, { name: "Categories", href: "/categories" }, { name: category.name }]}
      />
      <Container className="py-10 sm:py-12">
        <Suspense fallback={<ListingSkeleton />}>
          <ProductListing searchParams={searchParams} basePath={`/categories/${category.slug}`} fixed={{ category: category.slug }} />
        </Suspense>
      </Container>
    </>
  );
}

export default function CategoryPage(props: PageProps<"/categories/[slug]">) {
  return (
    <Suspense fallback={<ListingSkeleton />}>
      <CategoryContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
