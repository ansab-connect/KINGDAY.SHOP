import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";
import { ListingSkeleton } from "@/components/store/shop/listing-skeleton";
import { ProductListing } from "@/components/store/shop/product-listing";
import { getAllCategories, getCategoryBySlug, getCategoryTrail } from "@/features/catalog/queries";

export async function generateStaticParams() {
  const all = await getAllCategories();
  // Cache Components requires at least one param; an unknown slug renders the 404 page.
  return all.length ? all.map((c) => ({ slug: c.slug })) : [{ slug: "all" }];
}

export async function generateMetadata({ params }: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };
  return {
    title: category.seoTitle ?? `${category.name} for Kids`,
    description: category.seoDescription ?? `${category.description} Shop ${category.name.toLowerCase()} at KING DAY.`,
    alternates: { canonical: `/categories/${category.slug}` },
    openGraph: { title: `${category.name} | KING DAY`, description: category.description },
  };
}

async function CategoryContent({ params, searchParams }: Pick<PageProps<"/categories/[slug]">, "params" | "searchParams">) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  const [all, trail] = await Promise.all([getAllCategories(), getCategoryTrail(category.slug)]);
  const parent = category.parentSlug ? all.find((c) => c.slug === category.parentSlug) ?? null : null;
  // Categories nest to any depth. With sub-categories: show them (go one level deeper).
  // At the last level: show its siblings, so shoppers can switch sideways.
  const own = all.filter((c) => c.parentSlug === category.slug);
  const top = own.length || !parent ? category : parent;
  const children = own.length ? own : parent ? all.filter((c) => c.parentSlug === parent.slug) : [];

  return (
    <>
      <PageHero
        title={category.name}
        description={category.description}
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Categories", href: "/categories" },
          ...trail.filter((c) => c.slug !== category.slug).map((c) => ({ name: c.name, href: `/categories/${c.slug}` })),
          { name: category.name },
        ]}
      />
      <Container className="py-10 sm:py-12">
        {children.length ? (
          <nav aria-label={`${top.name} sub-categories`} className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex gap-2">
              {[{ slug: top.slug, name: `All ${top.name}`, productCount: top.productCount }, ...children].map((c) => {
                const on = c.slug === category.slug;
                return (
                  <li key={c.slug} className="shrink-0">
                    <Link
                      href={`/categories/${c.slug}`}
                      aria-current={on ? "page" : undefined}
                      className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors ${on ? "border-royal bg-royal text-white" : "bg-white text-deep hover:border-royal-200 hover:text-royal"}`}
                    >
                      {c.name} <span className={`text-xs font-normal ${on ? "text-white/75" : "text-muted-foreground"}`}>{c.productCount}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
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
