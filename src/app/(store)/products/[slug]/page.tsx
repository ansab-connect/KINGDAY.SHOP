import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductSkeleton } from "@/components/store/product/product-skeleton";
import { Check, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { Breadcrumbs } from "@/components/store/page-hero";
import { Price, Rating, Stars } from "@/components/store/price";
import { ProductGrid } from "@/components/store/product-card";
import { ProductGallery } from "@/components/store/product/product-gallery";
import { PurchasePanel } from "@/components/store/product/purchase-panel";
import { Container, SectionHeading } from "@/components/store/section";
import { siteConfig } from "@/config/site";
import { storeContact } from "@/config/storefront";
import {
  getAllProducts,
  getProductBySlug,
  getRelatedProducts,
  getReviewsForProduct,
} from "@/features/catalog/queries";
import { formatDate } from "@/lib/format";

const isPreview = process.env.NEXT_PUBLIC_USE_PREVIEW_DATA !== "false";

export function generateStaticParams() {
  return getAllProducts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  const title = `${product.name} | ${product.category.name}`;
  return {
    title,
    description: `${product.name} by ${product.brand.name}. ${product.shortDescription}`,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: "website",
      title: `${product.name} | ${siteConfig.name}`,
      description: product.shortDescription,
      images: product.images[0] ? [{ url: product.images[0].src, alt: product.images[0].alt }] : undefined,
    },
  };
}

async function ProductContent({ params }: Pick<PageProps<"/products/[slug]">, "params">) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const reviews = getReviewsForProduct(product.slug);
  const related = getRelatedProducts(product, 4);
  const productUrl = `${siteConfig.url}/products/${product.slug}`;
  const waNumber = storeContact.whatsapp.replace(/\D/g, "") || null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: product.description.join(" "),
    brand: { "@type": "Brand", name: product.brand.name },
    category: product.category.name,
    image: product.images.map((i) => i.src),
    url: productUrl,
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "INR",
      price: (product.price / 100).toFixed(2),
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: siteConfig.name },
    },
    // Ratings are only published once they come from real customers.
    ...(isPreview ? {} : { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviewCount } }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped cannot break out of the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Container className="pt-6 pb-16 sm:pt-8">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: product.category.name, href: `/categories/${product.category.slug}` },
            { name: product.name },
          ]}
        />

        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <ProductGallery images={product.images} video={product.video} categorySlug={product.category.slug} name={product.name} />

          <div className="lg:pt-2">
            <p className="text-xs font-semibold tracking-[0.16em] text-gold-600 uppercase">{product.brand.name}</p>
            <h1 className="mt-2 text-3xl leading-tight font-extrabold text-deep sm:text-4xl">{product.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <a href="#reviews" className="hover:underline"><Rating value={product.rating} count={product.reviewCount} className="text-sm" /></a>
              <span className="text-muted-foreground">SKU: <span className="font-medium text-deep">{product.sku}</span></span>
              <span className="text-muted-foreground">Age: <span className="font-medium text-deep">{product.ageRange}</span></span>
            </div>

            <Price price={product.price} mrp={product.mrp} size="lg" className="mt-6" />
            <p className="mt-1 text-xs text-muted-foreground">MRP inclusive of all taxes</p>

            <p className="mt-6 text-base leading-relaxed text-muted-foreground">{product.shortDescription}</p>

            <div className="mt-8">
              <PurchasePanel
                name={product.name}
                sku={product.sku}
                stock={product.stock}
                colours={product.colours}
                whatsappNumber={waNumber}
                productUrl={productUrl}
              />
            </div>

            <ul className="mt-8 grid gap-3 rounded-2xl bg-muted/60 p-5 text-sm sm:grid-cols-3">
              <li className="flex items-center gap-2.5"><ShieldCheck aria-hidden className="size-5 text-royal" /> Safety-checked</li>
              <li className="flex items-center gap-2.5"><Truck aria-hidden className="size-5 text-royal" /> Tracked delivery</li>
              <li className="flex items-center gap-2.5"><RotateCcw aria-hidden className="size-5 text-royal" /> Easy support</li>
            </ul>
          </div>
        </div>

        {/* Details */}
        <div className="mt-16 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <section aria-labelledby="desc-heading">
            <h2 id="desc-heading" className="text-2xl font-bold text-deep">Product description</h2>
            <div className="mt-4 flex flex-col gap-4 text-base leading-relaxed text-muted-foreground">
              {product.description.map((p) => <p key={p}>{p}</p>)}
            </div>
            <h3 className="mt-8 font-heading text-lg font-semibold text-deep">Highlights</h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {product.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2 text-sm text-deep/80">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-600" /> {h}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="spec-heading">
            <h2 id="spec-heading" className="text-2xl font-bold text-deep">Specifications</h2>
            <dl className="mt-4 divide-y overflow-hidden rounded-2xl border">
              {product.specs.map((s) => (
                <div key={s.label} className="grid grid-cols-[42%_1fr] gap-4 px-5 py-3 text-sm odd:bg-muted/40">
                  <dt className="text-muted-foreground">{s.label}</dt>
                  <dd className="font-medium text-deep">{s.value}</dd>
                </div>
              ))}
              <div className="grid grid-cols-[42%_1fr] gap-4 px-5 py-3 text-sm">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="font-medium text-deep">{product.category.name}</dd>
              </div>
            </dl>
          </section>
        </div>

        {/* Reviews */}
        <section id="reviews" aria-labelledby="reviews-heading" className="mt-16 scroll-mt-28">
          <div className="flex flex-col gap-6 rounded-3xl bg-royal-50/60 p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <h2 id="reviews-heading" className="text-2xl font-bold text-deep">Customer reviews</h2>
              {isPreview ? <p className="mt-1 text-xs text-muted-foreground">Sample reviews shown in preview mode.</p> : null}
            </div>
            <div className="flex items-center gap-4 sm:ml-auto">
              <p className="font-heading text-5xl font-extrabold text-deep tabular">{product.rating.toFixed(1)}</p>
              <div>
                <Stars value={product.rating} />
                <p className="mt-1 text-sm text-muted-foreground">{product.reviewCount} reviews</p>
              </div>
            </div>
          </div>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border p-6">
                <Stars value={r.rating} />
                <p className="mt-3 font-heading font-semibold text-deep">{r.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
                <p className="mt-4 text-xs text-muted-foreground">
                  <span className="font-medium text-deep">{r.author}</span> · {r.city} · {formatDate(r.date)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Related */}
        <section aria-label="Related products" className="mt-20">
          <SectionHeading eyebrow="You may also like" title="Related products" href={`/categories/${product.category.slug}`} linkLabel={`More ${product.category.name}`} />
          <ProductGrid products={related} />
        </section>
      </Container>
    </>
  );
}

export default function ProductPage(props: PageProps<"/products/[slug]">) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={props.params} />
    </Suspense>
  );
}
