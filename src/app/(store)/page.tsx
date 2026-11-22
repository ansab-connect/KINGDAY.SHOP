import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BatteryCharging, Camera, Check, ChevronRight, Crown, Lock, MessageCircle, Music, Quote, ShieldCheck, ShoppingCart, Smile, Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { HeroStage } from "@/components/store/hero/hero-stage";
import { getActiveHeroTheme } from "@/features/marketing/hero-themes";
import { getInstagramPosts, INSTAGRAM_URL } from "@/features/marketing/instagram";
import { publicStorageUrl } from "@/lib/storage";
import { NewsletterForm } from "@/components/store/newsletter-form";
import { Stars } from "@/components/store/price";
import { ProductCard, ProductGrid } from "@/components/store/product-card";
import { CategoryIcon } from "@/components/store/product-visual";
import { Container, SectionHeading } from "@/components/store/section";
import { siteConfig } from "@/config/site";
import { whyChoose } from "@/config/storefront";
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
  const [categories, bestsellers, newArrivals, allOffers, brands, reviews, source, instagram, heroTheme] = await Promise.all([
    getCategories(),
    getBestsellers(4),
    getNewArrivals(8),
    getOfferProducts(20),
    getBrands(),
    getFeaturedReviews(3),
    getCatalogSource(),
    getInstagramPosts(),
    getActiveHeroTheme(),
  ]);
  const offers = allOffers.slice(0, 3);
  const topDiscount = Math.max(...allOffers.map((p) => discountPercent(p.mrp, p.price)), 0);

  return (
    <>
      {/* 1. Hero: our seasonal scene with King, Mia and the customer's characters */}
      <section className="bg-deep text-white">
        <HeroStage theme={heroTheme} split topDiscount={topDiscount} className="h-[22rem] w-full sm:h-[28rem] lg:h-[36rem]">
          <div className="absolute inset-0 z-10 bg-gradient-to-b from-deep/80 via-deep/20 to-transparent lg:bg-gradient-to-r lg:from-deep/85 lg:via-deep/45 lg:to-transparent" />
          <Container className="absolute inset-x-0 top-0 z-10 pt-5 text-center sm:pt-8 lg:inset-y-0 lg:flex lg:items-center lg:pt-0 lg:text-left">
            <div className="lg:max-w-[46%]">
              <p className="hidden items-center gap-2 text-base font-semibold text-white/90 lg:flex">
                <Crown aria-hidden className="size-6 text-gold" /> <L en="Premium Kids Ride-On Toys" ml="കുട്ടികൾക്കുള്ള പ്രീമിയം റൈഡ്-ഓണുകൾ" />
              </p>
              <h1 className="text-[1.7rem] leading-[1.1] font-extrabold drop-shadow-[0_2px_6px_rgb(0_0_0/0.45)] sm:text-5xl lg:mt-4 lg:text-[3.6rem]">
                <L en={<>Every Child Deserves <br className="hidden lg:block" />a <span className="text-gold">Royal Ride.</span></>} ml={<span className="block text-[0.72em] leading-tight">ഓരോ കുഞ്ഞിനും ഒരു <span className="text-gold">രാജകീയ യാത്ര.</span></span>} />
              </h1>
              <ul className="mt-7 hidden flex-wrap gap-2.5 lg:flex">
                {[
                  { icon: ShieldCheck, en: "Safe & Sturdy", ml: "സുരക്ഷിതം" },
                  { icon: BatteryCharging, en: "Rechargeable", ml: "റീചാർജബിൾ" },
                  { icon: Music, en: "Music & Lights", ml: "സംഗീതം & ലൈറ്റ്" },
                  { icon: Smile, en: "Kid-Friendly Design", ml: "കുട്ടികൾക്കിണങ്ങിയ" },
                ].map((f) => (
                  <li key={f.en} className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm leading-tight font-medium backdrop-blur-sm">
                    <f.icon aria-hidden className="size-5 text-gold" /> <L en={f.en} ml={f.ml} />
                  </li>
                ))}
              </ul>
              <div className="mt-8 hidden gap-4 lg:flex">
                <Link
                  href="/shop"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gold px-6 text-sm font-bold text-deep shadow-[0_10px_30px_-10px_rgb(212_175_55/0.8)] transition-all hover:bg-gold-300 sm:h-13 sm:px-8 sm:text-base"
                >
                  <ShoppingCart aria-hidden className="size-5" /> <L en="Shop Now" ml="ഇപ്പോൾ വാങ്ങൂ" />
                  <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/book-service"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border-2 border-white/80 px-6 text-sm font-bold text-white transition-colors hover:bg-white/10 sm:h-13 sm:px-8 sm:text-base"
                >
                  <Wrench aria-hidden className="size-5" /> <L en="Book a Service" ml="സർവീസ് ബുക്ക് ചെയ്യുക" />
                </Link>
              </div>
            </div>
          </Container>
        </HeroStage>
        {/* Phones and tablets: buttons and features under the scene */}
        <Container className="py-4 lg:hidden">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-center sm:gap-3">
            <Link
                  href="/shop"
                  className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gold px-4 text-sm font-bold text-deep shadow-[0_10px_30px_-10px_rgb(212_175_55/0.8)] transition-all hover:bg-gold-300 sm:h-13 sm:px-8 sm:text-base"
                >
                  <ShoppingCart aria-hidden className="size-5" /> <L en="Shop Now" ml="ഇപ്പോൾ വാങ്ങൂ" />
                  <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/book-service"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-white/80 px-4 text-sm font-bold text-white transition-colors hover:bg-white/10 sm:h-13 sm:px-8 sm:text-base"
                >
                  <Wrench aria-hidden className="size-5" /> <L en="Book a Service" ml="സർവീസ് ബുക്ക് ചെയ്യുക" />
                </Link>
          </div>
          <ul className="mt-3 flex snap-x gap-2 overflow-x-auto [scrollbar-width:none] sm:justify-center [&::-webkit-scrollbar]:hidden">
            {[
                  { icon: ShieldCheck, en: "Safe & Sturdy", ml: "സുരക്ഷിതം" },
                  { icon: BatteryCharging, en: "Rechargeable", ml: "റീചാർജബിൾ" },
                  { icon: Music, en: "Music & Lights", ml: "സംഗീതം & ലൈറ്റ്" },
                  { icon: Smile, en: "Kid-Friendly Design", ml: "കുട്ടികൾക്കിണങ്ങിയ" },
                ].map((f) => (
              <li key={f.en} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium whitespace-nowrap">
                <f.icon aria-hidden className="size-4 text-gold" /> <L en={f.en} ml={f.ml} />
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* 2. Featured categories: cards that overlap the hero */}
      <section className="relative z-10 pb-6 sm:pb-10 lg:-mt-14">
        <Container>
          <h2 className="sr-only"><L en="Shop by category" ml="വിഭാഗം അനുസരിച്ച്" /></h2>
          <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pt-5 pb-3 [scrollbar-color:var(--color-royal-200)_transparent] [scrollbar-width:thin] lg:gap-4 lg:pt-0">
            {categories.map((c, i) => (
              <li key={c.slug} className="w-60 shrink-0 snap-start lg:w-72">
                <Link
                  href={`/categories/${c.slug}`}
                  className={`group flex h-full items-center gap-3 rounded-2xl border border-white p-3 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift sm:p-4 ${["bg-royal-50", "bg-[#fbeef8]", "bg-[#f1ecfb]", "bg-gold-50"][i % 4]}`}
                >
                  <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/70 sm:size-24">
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- category photos from our own storage
                      <img src={c.imageUrl} alt="" loading={i < 4 ? "eager" : "lazy"} className="size-full object-contain p-1 transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <CategoryIcon slug={c.slug} strokeWidth={1.4} className="size-10 text-royal" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-sm leading-tight font-extrabold text-deep uppercase xl:text-base">{c.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground"><L en={`${c.productCount} items`} ml={`${c.productCount} എണ്ണം`} /></span>
                  </span>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-deep shadow-sm transition-transform group-hover:translate-x-0.5">
                    <ChevronRight aria-hidden className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* 3. Bestsellers */}
      {bestsellers.length ? (
      <section className="bg-white py-10 sm:py-14">
        <Container>
          <SectionHeading eyebrow={<L en="Most loved" ml="ഏറ്റവും ഇഷ്ടപ്പെട്ടവ" />} title={<L en="Bestsellers" ml="ബെസ്റ്റ് സെല്ലറുകൾ" />} description={<L en="The rides families choose again and again." ml="കുടുംബങ്ങൾ വീണ്ടും വീണ്ടും തിരഞ്ഞെടുക്കുന്നവ." />} href="/shop?sort=rating" />
          <ProductGrid products={bestsellers} />
        </Container>
      </section>
      ) : null}

      {/* 4. New arrivals */}
      {newArrivals.length ? (
      <section className="py-10 sm:py-14">
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
      <section className="py-10 sm:py-14">
        <Container>
          <SectionHeading eyebrow={<L en="Trusted makers" ml="വിശ്വസ്ത നിർമ്മാതാക്കൾ" />} title={<L en="Featured brands" ml="പ്രധാന ബ്രാൻഡുകൾ" />} align="center" />
          <ul className="flex flex-wrap justify-center gap-2 sm:gap-3">
            {brands.map((b) => (
              <li key={b.slug}>
                <Link
                  href={`/shop?brand=${b.slug}`}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-border/70 bg-white px-5 text-sm font-semibold text-deep transition-colors hover:border-royal-200 hover:text-royal"
                >
                  {b.name} <span className="text-xs font-normal text-muted-foreground">{b.productCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
      ) : null}

      {/* 7. Why choose KING DAY */}
      <section className="bg-white py-10 sm:py-14">
        <Container>
          <SectionHeading eyebrow={<L en="The KING DAY promise" ml="KING DAY ഉറപ്പ്" />} title={<L en="Why families choose us" ml="കുടുംബങ്ങൾ ഞങ്ങളെ തിരഞ്ഞെടുക്കുന്നതെന്തുകൊണ്ട്" />} align="center" />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {whyChoose.map((w) => {
              const Icon = whyIcons[w.icon];
              return (
                <li key={w.title} className="flex gap-4 rounded-2xl border border-border/70 bg-canvas/60 p-5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-royal text-gold">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-deep">{w.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{w.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* 8. Customer reviews */}
      {reviews.length ? (
      <section className="py-10 sm:py-14">
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
      <section className="pb-10 sm:pb-14">
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
      <section className="pb-10 sm:pb-14">
        <Container>
          <SectionHeading eyebrow="@kingday.official" title="Royal Moments" description="Real rides, real smiles, from our Instagram." align="center" />
          {instagram.length ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
              {instagram.map((p) => {
                const src = publicStorageUrl("category-images", p.image_path);
                return (
                  <li key={p.url}>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-xl" aria-label={p.caption || "Open this post on Instagram"}>
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element -- post thumbnails uploaded by the admin
                        <img src={src} alt={p.caption} loading="lazy" className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : null}
                      <span aria-hidden className="absolute inset-0 grid place-items-center bg-deep/0 transition-colors group-hover:bg-deep/40">
                        <Camera className="size-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="mt-6 flex justify-center">
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] px-6 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              <Camera aria-hidden className="size-4" /> Follow @kingday.official
            </a>
          </div>
        </Container>
      </section>

      {/* 11. Newsletter */}
      <section className="pb-10 sm:pb-14">
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
