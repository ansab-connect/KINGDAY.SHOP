import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Camera, Check, Lock, MessageCircle, Quote, ShieldCheck } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { HeroArt } from "@/components/store/hero-art";
import { NewsletterForm } from "@/components/store/newsletter-form";
import { Stars } from "@/components/store/price";
import { ProductCard, ProductGrid } from "@/components/store/product-card";
import { CategoryIcon, ProductVisual } from "@/components/store/product-visual";
import { Container, SectionHeading } from "@/components/store/section";
import { siteConfig } from "@/config/site";
import { storeContact, whyChoose } from "@/config/storefront";
import {
  getBestsellers,
  getCatalogSource,
  getBrands,
  getCategories,
  getFeaturedReviews,
  getNewArrivals,
  getOfferProducts,
} from "@/features/catalog/queries";
import { discountPercent } from "@/lib/format";

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name} | Premium Kids' Electric Jeeps, Bikes & Scooters` },
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

const whyIcons = { shield: ShieldCheck, check: Check, lock: Lock, chat: MessageCircle } as const;

export default async function HomePage() {
  const [categories, bestsellers, newArrivals, allOffers, brands, reviews, source] = await Promise.all([
    getCategories(),
    getBestsellers(4),
    getNewArrivals(8),
    getOfferProducts(20),
    getBrands(),
    getFeaturedReviews(3),
    getCatalogSource(),
  ]);
  const offers = allOffers.slice(0, 3);
  const topDiscount = Math.max(...allOffers.map((p) => discountPercent(p.mrp, p.price)), 0);

  return (
    <>
      {/* 1. Hero */}
      <section className="relative overflow-hidden bg-deep text-white">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_85%_30%,rgb(109_38_168/0.45),transparent_70%)]" />
        <Container className="relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
            <p className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-gold uppercase">
              <L en="Premium kids' rides" ml="കുട്ടികൾക്കുള്ള പ്രീമിയം റൈഡുകൾ" />
            </p>
            <h1 className="mt-6 text-4xl leading-[1.05] font-extrabold sm:text-5xl lg:text-6xl">
              <L en={<>Every child deserves a <span className="text-gold">royal ride.</span></>} ml={<span className="block text-[0.72em] leading-tight">ഓരോ കുഞ്ഞിനും ഒരു <span className="text-gold">രാജകീയ യാത്ര.</span></span>} />
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-white/70 sm:text-lg">
              <L en="Electric jeeps, bikes, scooters and more, chosen for safety, built to last and finished like royalty." ml="ഇലക്ട്രിക് ജീപ്പുകൾ, ബൈക്കുകൾ, സ്കൂട്ടറുകൾ എന്നിവയും മറ്റും. സുരക്ഷയ്ക്കായി തിരഞ്ഞെടുത്തത്, ദീർഘകാലം നിലനിൽക്കുന്നത്." />
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/shop"
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-gold px-7 text-sm font-semibold text-deep shadow-[0_10px_30px_-10px_rgb(212_175_55/0.7)] transition-all hover:bg-gold-300 focus-visible:ring-3 focus-visible:ring-gold/40 focus-visible:outline-none"
              >
                <L en="Shop the collection" ml="കളക്ഷൻ കാണുക" />
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/categories/electric-jeeps-cars"
                className="inline-flex h-12 items-center rounded-full border border-white/25 px-7 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/5"
              >
                <L en="Explore electric jeeps" ml="ഇലക്ട്രിക് ജീപ്പുകൾ" />
              </Link>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/70">
              {[
                ["Safety-checked rides", "സുരക്ഷ ഉറപ്പാക്കിയ റൈഡുകൾ"],
                ["Secure Razorpay checkout", "സുരക്ഷിത Razorpay പേയ്മെന്റ്"],
                ["WhatsApp support", "WhatsApp സഹായം"],
              ].map(([en, ml]) => (
                <li key={en} className="flex items-center gap-2">
                  <Check aria-hidden className="size-4 text-gold" /> <L en={en} ml={ml} />
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <HeroArt className="h-auto w-full" />
          </div>
        </Container>
      </section>

      {/* 2. Featured categories */}
      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading eyebrow={<L en="Shop by category" ml="വിഭാഗം അനുസരിച്ച്" />} title={<L en="Find the perfect ride" ml="മികച്ച റൈഡ് കണ്ടെത്തൂ" />} href="/categories" linkLabel={<L en="All categories" ml="എല്ലാ വിഭാഗങ്ങളും" />} />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {categories.map((c, i) => {
              const feature = i === 0;
              return (
                <li key={c.slug} className={feature ? "col-span-2 sm:col-span-3 lg:col-span-2 lg:row-span-2" : ""}>
                  <Link
                    href={`/categories/${c.slug}`}
                    className={`group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl p-5 ring-1 transition-all duration-500 ease-royal hover:-translate-y-1 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      feature ? "min-h-48 bg-royal text-white ring-royal lg:min-h-full" : "min-h-36 bg-royal-50/60 text-deep ring-border/60 hover:bg-white"
                    }`}
                  >
                    <CategoryIcon
                      slug={c.slug}
                      strokeWidth={1.25}
                      className={`transition-transform duration-500 ease-royal group-hover:scale-110 ${feature ? "size-20 text-gold" : "size-10 text-royal"}`}
                    />
                    <div className="mt-6">
                      <p className={`font-heading font-bold ${feature ? "text-2xl" : "text-base"}`}>{c.name}</p>
                      <p className={`mt-1 text-xs ${feature ? "text-white/70" : "text-muted-foreground"}`}>
                        {feature ? c.description : <L en={`${c.productCount} products`} ml={`${c.productCount} ഉൽപ്പന്നങ്ങൾ`} />}
                      </p>
                    </div>
                    <ArrowRight aria-hidden className={`absolute top-5 right-5 size-4 transition-transform group-hover:translate-x-0.5 ${feature ? "text-gold" : "text-royal-300"}`} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* 3. Bestsellers */}
      {bestsellers.length ? (
      <section className="bg-muted/50 py-16 sm:py-20">
        <Container>
          <SectionHeading eyebrow={<L en="Most loved" ml="ഏറ്റവും ഇഷ്ടപ്പെട്ടവ" />} title={<L en="Bestsellers" ml="ബെസ്റ്റ് സെല്ലറുകൾ" />} description={<L en="The rides families choose again and again." ml="കുടുംബങ്ങൾ വീണ്ടും വീണ്ടും തിരഞ്ഞെടുക്കുന്നവ." />} href="/shop?sort=rating" />
          <ProductGrid products={bestsellers} />
        </Container>
      </section>
      ) : null}

      {/* 4. New arrivals */}
      {newArrivals.length ? (
      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading eyebrow={<L en="Just landed" ml="പുതിയതായി എത്തിയവ" />} title={<L en="New arrivals" ml="പുതിയ ഉൽപ്പന്നങ്ങൾ" />} href="/shop?sort=newest" />
        </Container>
        <div className="mx-auto max-w-7xl">
          <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-4 sm:gap-6 sm:px-6 lg:px-8 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            {newArrivals.map((p) => (
              <li key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[22.5%]">
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </div>
      </section>
      ) : null}

      {/* 5. Special offers */}
      {offers.length ? (
      <section className="py-4 sm:py-8">
        <Container>
          <div className="grid overflow-hidden rounded-3xl bg-deep lg:grid-cols-[1fr_1.6fr]">
            <div className="relative flex flex-col justify-center p-8 text-white sm:p-12">
              <div aria-hidden className="absolute -top-24 -left-24 size-72 rounded-full bg-royal/60 blur-3xl" />
              <p className="relative text-xs font-semibold tracking-[0.2em] text-gold uppercase"><L en="Special offers" ml="പ്രത്യേക ഓഫറുകൾ" /></p>
              <p className="relative mt-3 font-heading text-4xl font-extrabold sm:text-5xl">
                <L en={<>Up to <span className="text-gold">{topDiscount}%</span> off</>} ml={<><span className="text-gold">{topDiscount}%</span> വരെ ഇളവ്</>} />
              </p>
              <p className="relative mt-3 max-w-xs text-sm text-white/70"><L en="Selected rides and toys at royal prices, for a limited time." ml="തിരഞ്ഞെടുത്ത റൈഡുകളും കളിപ്പാട്ടങ്ങളും പരിമിത കാലത്തേക്ക് മികച്ച വിലയിൽ." /></p>
              <Link href="/offers" className="relative mt-8 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-gold px-6 text-sm font-semibold text-deep hover:bg-gold-300">
                <L en="See all offers" ml="എല്ലാ ഓഫറുകളും" /> <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
            <ul className="grid grid-cols-1 gap-4 bg-white p-4 sm:grid-cols-3 sm:p-6 lg:rounded-l-3xl">
              {offers.map((p) => (
                <li key={p.id}><ProductCard product={p} /></li>
              ))}
            </ul>
          </div>
        </Container>
      </section>
      ) : null}

      {/* 6. Featured brands */}
      {brands.length ? (
      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading eyebrow={<L en="Trusted makers" ml="വിശ്വസ്ത നിർമ്മാതാക്കൾ" />} title={<L en="Featured brands" ml="പ്രധാന ബ്രാൻഡുകൾ" />} align="center" />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {brands.map((b) => (
              <li key={b.slug}>
                <Link
                  href={`/shop?brand=${b.slug}`}
                  className="group flex h-full flex-col items-center justify-center rounded-2xl border bg-white px-4 py-8 text-center transition-all duration-300 hover:border-royal-200 hover:shadow-card"
                >
                  <span className="font-heading text-lg font-bold tracking-wide text-deep group-hover:text-royal">{b.name}</span>
                  <span className="mt-1 text-xs text-muted-foreground"><L en={`${b.productCount} products`} ml={`${b.productCount} ഉൽപ്പന്നങ്ങൾ`} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
      ) : null}

      {/* 7. Why choose KING DAY */}
      <section className="bg-royal-50/60 py-16 sm:py-20">
        <Container>
          <SectionHeading eyebrow={<L en="The KING DAY promise" ml="KING DAY ഉറപ്പ്" />} title={<L en="Why families choose us" ml="കുടുംബങ്ങൾ ഞങ്ങളെ തിരഞ്ഞെടുക്കുന്നതെന്തുകൊണ്ട്" />} align="center" />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {whyChoose.map((w) => {
              const Icon = whyIcons[w.icon];
              return (
                <li key={w.title} className="rounded-2xl bg-white p-6 shadow-card">
                  <span className="grid size-12 place-items-center rounded-xl bg-royal text-gold">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-deep">{w.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{w.body}</p>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* 8. Customer reviews */}
      {reviews.length ? (
      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading eyebrow={<L en="Happy little royals" ml="സന്തുഷ്ട കുഞ്ഞുങ്ങൾ" />} title={<L en="What parents say" ml="മാതാപിതാക്കൾ പറയുന്നത്" />} description={source === "preview" ? "Sample reviews shown in preview mode." : undefined} align="center" />
          <ul className="grid gap-4 md:grid-cols-3">
            {reviews.map((r) => (
              <li key={r.id} className="relative flex flex-col rounded-2xl border bg-white p-6">
                <Quote aria-hidden className="absolute top-6 right-6 size-8 text-gold-200" />
                <Stars value={r.rating} />
                <p className="mt-4 font-heading text-lg font-semibold text-deep">{r.title}</p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
                <p className="mt-5 text-sm font-medium text-deep">
                  {r.author} <span className="font-normal text-muted-foreground">· {r.city}</span>
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </section>
      ) : null}

      {/* 9. Promotional banners */}
      <section className="pb-16 sm:pb-20">
        <Container className="grid gap-4 md:grid-cols-2">
          <PromoBanner
            href="/categories/electric-jeeps-cars"
            eyebrow="Ride-on jeeps & cars"
            title="Their first set of wheels"
            body="Parental remotes, soft starts and real-feel details."
            categorySlug="electric-jeeps-cars"
            tone="royal"
          />
          <PromoBanner
            href="/categories/tricycles"
            eyebrow="For toddlers"
            title="Tiny trikes, big adventures"
            body="Parent-handle tricycles that grow with your child."
            categorySlug="tricycles"
            tone="gold"
          />
        </Container>
      </section>

      {/* 10. Instagram */}
      <section className="pb-16 sm:pb-20">
        <Container>
          <SectionHeading
            eyebrow="#KingDayRides"
            title="Royal moments"
            description={storeContact.instagram ? `Follow ${storeContact.instagram} on Instagram` : "Our Instagram feed appears here once connected."}
            align="center"
          />
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
            {categories.slice(0, 6).map((c) => (
              <li key={c.slug} className="group relative">
                <ProductVisual categorySlug={c.slug} className="aspect-square rounded-xl" />
                <span aria-hidden className="absolute inset-0 grid place-items-center rounded-xl bg-deep/0 transition-colors group-hover:bg-deep/40">
                  <Camera className="size-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* 11. Newsletter */}
      <section className="pb-16 sm:pb-20">
        <Container>
          <div className="relative overflow-hidden rounded-3xl bg-royal px-6 py-12 text-center sm:px-12 sm:py-16">
            <div aria-hidden className="absolute -right-20 -bottom-28 size-80 rounded-full border border-gold/30" />
            <div aria-hidden className="absolute -right-8 -bottom-16 size-56 rounded-full border border-gold/20" />
            <p className="relative text-xs font-semibold tracking-[0.2em] text-gold uppercase"><L en="Join the royal club" ml="റോയൽ ക്ലബ്ബിൽ ചേരൂ" /></p>
            <h2 className="relative mt-3 text-3xl font-bold text-white sm:text-4xl"><L en="Offers and new arrivals, first." ml="ഓഫറുകളും പുതിയ ഉൽപ്പന്നങ്ങളും ആദ്യം അറിയൂ." /></h2>
            <p className="relative mx-auto mt-3 max-w-md text-sm text-white/70">
              <L en="One thoughtful email a month. No spam, unsubscribe any time." ml="മാസത്തിൽ ഒരു ഇമെയിൽ മാത്രം. സ്പാം ഇല്ല, എപ്പോൾ വേണമെങ്കിലും നിർത്താം." />
            </p>
            <div className="relative mt-8 flex justify-center">
              <NewsletterForm />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function PromoBanner({
  href,
  eyebrow,
  title,
  body,
  categorySlug,
  tone,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  categorySlug: string;
  tone: "royal" | "gold";
}) {
  const dark = tone === "royal";
  return (
    <Link
      href={href}
      className={`group relative flex min-h-60 overflow-hidden rounded-3xl p-8 transition-shadow duration-500 hover:shadow-lift sm:p-10 ${
        dark ? "bg-deep text-white" : "bg-gold-100 text-deep"
      }`}
    >
      <div className="relative z-10 max-w-[60%]">
        <p className={`text-xs font-semibold tracking-[0.2em] uppercase ${dark ? "text-gold" : "text-gold-700"}`}>{eyebrow}</p>
        <p className="mt-3 font-heading text-2xl font-bold sm:text-3xl">{title}</p>
        <p className={`mt-2 text-sm ${dark ? "text-white/70" : "text-deep/70"}`}>{body}</p>
        <span className={`mt-6 inline-flex items-center gap-1.5 text-sm font-semibold ${dark ? "text-gold" : "text-royal"}`}>
          <L en="Shop now" ml="ഇപ്പോൾ വാങ്ങൂ" /> <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <CategoryIcon
        slug={categorySlug}
        strokeWidth={1}
        className={`absolute -right-6 -bottom-8 size-56 transition-transform duration-700 ease-royal group-hover:-translate-x-2 group-hover:scale-105 ${
          dark ? "text-royal-400/50" : "text-gold-400/60"
        }`}
      />
    </Link>
  );
}
