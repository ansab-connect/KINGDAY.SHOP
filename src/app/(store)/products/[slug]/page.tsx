import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductSkeleton } from "@/components/store/product/product-skeleton";
import Link from "next/link";
import { Banknote, Check, ChevronDown, FileText, ListChecks, Package, RotateCcw, ShieldCheck, Sparkles, Star, Truck, Wrench } from "lucide-react";
import { RecentlyViewed } from "@/components/store/product/recently-viewed";
import { L } from "@/components/i18n/lang";
import { Breadcrumbs } from "@/components/store/page-hero";
import { Rating, Stars } from "@/components/store/price";
import { ProductGrid } from "@/components/store/product-card";
import { resolveSocialVideo } from "@/features/catalog/social-video";
import { ProductFacts, VariantGallery, VariantSelectionProvider, VariantSpecs } from "@/components/store/product/variant-selection";
import { PurchasePanel, VariantOptions } from "@/components/store/product/purchase-panel";
import { Container, SectionHeading } from "@/components/store/section";
import { siteConfig } from "@/config/site";
import { storeContact } from "@/config/storefront";
import {
  getAllProducts,
  getCatalogSource,
  getProductBySlug,
  getProductExtras,
  getRelatedProducts,
  getReviewsForProduct,
} from "@/features/catalog/queries";
import { getPublicPriceSettings } from "@/features/orders/checkout";
import { formatDate } from "@/lib/format";

export async function generateStaticParams() {
  const products = await getAllProducts();
  // Cache Components requires at least one param; an unknown slug renders the 404 page.
  return products.length ? products.map((p) => ({ slug: p.slug })) : [{ slug: "coming-soon" }];
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  const title = product.seoTitle ?? `${product.name} | ${product.category.name}`;
  return {
    title,
    description:
      product.seoDescription ??
      [product.name, product.brand ? `by ${product.brand.name}.` : ".", product.shortDescription].join(" ").replace(" .", ".").trim(),
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
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [reviews, related, source, priceSettings, extras] = await Promise.all([
    getReviewsForProduct(product.slug),
    getRelatedProducts(product, 4),
    getCatalogSource(),
    getPublicPriceSettings(),
    getProductExtras(product.id),
  ]);
  const warrantyLines = extras.warranties.map((w) => w.label);
  const isPreview = source === "preview";
  const boxSpec = product.specs.find((s) => /in the box|box content|package content|included/i.test(s.label));
  const warrantySpec = product.specs.find((s) => /warranty/i.test(s.label));
  const productUrl = `${siteConfig.url}/products/${product.slug}`;
  const social = await resolveSocialVideo(product.videoLink ?? null);
  const waNumber = storeContact.whatsapp.replace(/\D/g, "") || null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description.join(" "),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand.name } } : {}),
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
    ...(isPreview || product.reviewCount === 0 ? {} : { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviewCount } }),
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

        <VariantSelectionProvider variants={product.variants} defaultVariantId={product.defaultVariantId}>
        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Laptop/desktop: the photos stay in view while the details column scrolls (no blank area). */}
          <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
            <VariantGallery sharedImages={product.sharedImages} video={product.video} social={social} categorySlug={product.category.slug} name={product.name} />
            {/* Variants, size and warranty sit right under the photos on every screen size. */}
            <div className="mt-5 flex flex-col gap-4">
              <VariantOptions variantTypes={product.variantTypes} />
              <ProductFacts size={extras.size} variantSizes={extras.variantSizes} warranties={warrantyLines} />
            </div>
          </div>

          <div className="lg:pt-2">
            {product.brand ? <p className="text-xs font-semibold tracking-[0.16em] text-gold-600 uppercase">{product.brand.name}</p> : null}
            <h1 className="mt-2 text-3xl leading-tight font-extrabold text-deep sm:text-4xl">{product.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {product.reviewCount > 0 ? (
                <a href="#reviews" className="hover:underline"><Rating value={product.rating} count={product.reviewCount} className="text-sm" /></a>
              ) : null}
              {product.ageRange ? (
                <span className="text-muted-foreground"><L en="Age" ml="പ്രായം" />: <span className="font-medium text-deep">{product.ageRange}</span></span>
              ) : null}
            </div>

            <div className="mt-6">
              <PurchasePanel
                productId={product.id}
                name={product.name}
                shortDescription={product.shortDescription}
                variantTypes={product.variantTypes}
                fallbackImage={product.sharedImages[0]?.src ?? product.images[0]?.src ?? null}
                whatsappNumber={waNumber}
                productUrl={productUrl}
                prepaidPct={product.prepaidDiscountPct}
                codPct={product.codDiscountPct}
                settings={priceSettings}
              />
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <InfoSection title={<L en="Product Description" ml="ഉൽപ്പന്ന വിവരണം" />} icon={FileText} open>
                <div className="flex flex-col gap-3 leading-relaxed">
                  {product.description.length ? product.description.map((p) => <p key={p}>{p}</p>) : <p>{product.shortDescription || "Details coming soon."}</p>}
                </div>
              </InfoSection>
              {product.highlights.length ? (
                <InfoSection title={<L en="Key Features" ml="പ്രധാന സവിശേഷതകൾ" />} icon={Sparkles}>
                  <ul className="flex flex-col gap-2">
                    {product.highlights.map((h) => (
                      <li key={h} className="flex gap-2">
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-600" /> {h}
                      </li>
                    ))}
                  </ul>
                </InfoSection>
              ) : null}
              <InfoSection title={<L en="Specifications" ml="സ്പെസിഫിക്കേഷനുകൾ" />} icon={ListChecks}>
                <VariantSpecs specs={product.specs} categoryName={product.category.name} />
              </InfoSection>
              <InfoSection title={<L en="What's in the Box?" ml="ബോക്സിൽ എന്തൊക്കെ?" />} icon={Package}>
                {boxSpec ? <p>{boxSpec.value}</p> : <p>1 × {product.name} with the standard accessories supplied by the brand. Message us on WhatsApp for the exact box contents.</p>}
              </InfoSection>
              <InfoSection title={<L en="Warranty & Service" ml="വാറന്റിയും സർവീസും" />} icon={ShieldCheck}>
                <p>{warrantyLines.length ? warrantyLines.join(" · ") : warrantySpec ? warrantySpec.value : "Brand warranty as per the manufacturer's terms."}</p>
                <p className="mt-2">
                  After you buy, our BEST FIT team handles fitting, repairs and service.{" "}
                  <Link href="/policies/warranty" className="font-semibold text-royal hover:underline">Warranty policy</Link> ·{" "}
                  <Link href="/book-service" className="font-semibold text-royal hover:underline">Book a service</Link>
                </p>
              </InfoSection>
              <InfoSection id="reviews" title={<L en="Customer Reviews" ml="ഉപഭോക്തൃ അഭിപ്രായങ്ങൾ" />} icon={Star} badge={product.reviewCount > 0 ? `${product.rating.toFixed(1)} ★ · ${product.reviewCount}` : undefined}>
                {isPreview ? <p className="mb-2 text-xs">Sample reviews shown in preview mode.</p> : null}
                {reviews.length ? (
                  <ul className="flex flex-col gap-3">
                    {reviews.map((r) => (
                      <li key={r.id} className="rounded-xl border bg-white p-4">
                        <Stars value={r.rating} />
                        <p className="mt-2 font-heading font-semibold text-deep">{r.title}</p>
                        <p className="mt-1 text-sm leading-relaxed">{r.body}</p>
                        <p className="mt-2 text-xs">
                          <span className="font-medium text-deep">{r.author}</span>
                          {r.city ? ` · ${r.city}` : ""} · {formatDate(r.date)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p><L en="No reviews yet. Bought this? We'd love to hear from you." ml="ഇതുവരെ അഭിപ്രായങ്ങൾ ഇല്ല." /></p>
                )}
              </InfoSection>
            </div>

            <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl border bg-border text-sm sm:grid-cols-2">
              {[
                { icon: Truck, en: "Delivery", ml: "ഡെലിവറി", den: "Our team calls to confirm your delivery date.", dml: "ഡെലിവറി തീയതി ഞങ്ങൾ വിളിച്ച് ഉറപ്പിക്കും.", href: "/policies/shipping" },
                { icon: Banknote, en: "Cash on delivery", ml: "ക്യാഷ് ഓൺ ഡെലിവറി", den: "Pay when your order arrives.", dml: "ഓർഡർ എത്തുമ്പോൾ പണം നൽകാം.", href: null },
                { icon: ShieldCheck, en: "Warranty", ml: "വാറന്റി", den: "As per the brand. See our warranty policy.", dml: "ബ്രാൻഡ് വാറന്റി പ്രകാരം.", href: "/policies/warranty" },
                { icon: RotateCcw, en: "Returns", ml: "റിട്ടേൺ", den: "See returns & refunds.", dml: "റിട്ടേൺ നയം കാണുക.", href: "/policies/returns" },
                { icon: Wrench, en: "BEST FIT service", ml: "BEST FIT സർവീസ്", den: "Fitting, repair and service after you buy.", dml: "വാങ്ങിയ ശേഷം ഫിറ്റിംഗും സർവീസും.", href: "/book-service" },
              ].map((i) => {
                const body = (
                  <>
                    <i.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-royal" />
                    <span>
                      <span className="block font-semibold text-deep"><L en={i.en} ml={i.ml} /></span>
                      <span className="block text-muted-foreground"><L en={i.den} ml={i.dml} /></span>
                    </span>
                  </>
                );
                return (
                  <li key={i.en} className="bg-white">
                    {i.href ? (
                      <Link href={i.href} className="flex gap-3 p-4 hover:bg-muted/40">{body}</Link>
                    ) : (
                      <div className="flex gap-3 p-4">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        </VariantSelectionProvider>

        {/* Related */}
        {related.length ? (
          <section aria-label="Related products" className="mt-20">
            <SectionHeading eyebrow={<L en="You may also like" ml="നിങ്ങൾക്ക് ഇഷ്ടപ്പെട്ടേക്കാം" />} title={<L en="Related products" ml="സമാന ഉൽപ്പന്നങ്ങൾ" />} href={`/categories/${product.category.slug}`} linkLabel={`More ${product.category.name}`} />
            <ProductGrid products={related} />
          </section>
        ) : null}
        <RecentlyViewed current={{ slug: product.slug, name: product.name, image: product.images[0]?.src ?? null, price: product.price, mrp: product.mrp }} />
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

/** An expandable product-information card (native <details>: works without JavaScript). */
function InfoSection({
  id,
  title,
  icon: Icon,
  badge,
  open = false,
  children,
}: {
  id?: string;
  title: React.ReactNode;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  badge?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details id={id} open={open} className="group scroll-mt-28 rounded-2xl border bg-white open:shadow-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-heading text-base font-semibold text-deep">
        <span className="grid size-8 place-items-center rounded-lg bg-royal-50 text-royal">
          <Icon aria-hidden className="size-4" />
        </span>
        {title}
        {badge ? <span className="ml-1 rounded-full bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-700">{badge}</span> : null}
        <ChevronDown aria-hidden className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t px-4 py-4 text-sm text-muted-foreground">{children}</div>
    </details>
  );
}
