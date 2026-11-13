import Link from "next/link";
import { ArrowRight, Crown, LayoutDashboard } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brandColors, productCategories, siteConfig } from "@/config/site";

/**
 * Phase 1 placeholder: brand & design-system preview.
 * The premium storefront homepage replaces this page in Phase 3.
 */
export default function Home() {
  const swatches = [
    { name: "Royal Purple", hex: brandColors.royalPurple, className: "bg-royal text-white" },
    { name: "Matte Gold", hex: brandColors.matteGold, className: "bg-gold text-deep" },
    { name: "Deep Purple", hex: brandColors.deepPurple, className: "bg-deep text-white" },
    { name: "White", hex: brandColors.white, className: "bg-white text-deep ring-1 ring-border" },
  ];

  return (
    <main className="flex-1">
      <section className="relative overflow-hidden bg-deep text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <Logo tone="light" showTagline />
          <p className="mt-12 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-gold uppercase">
            <Crown className="size-4" aria-hidden /> Design system · Phase 1
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold sm:text-6xl">
            {siteConfig.tagline}
          </h1>
          <p className="mt-6 max-w-xl text-base text-white/70 sm:text-lg">
            The foundation for the KING DAY platform. The storefront homepage arrives in Phase 3.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-gold text-deep hover:bg-gold-300">
              <Link href="/admin">
                <LayoutDashboard aria-hidden /> Open admin panel
              </Link>
            </Button>
          </div>
        </div>
        <div aria-hidden className="gold-rule absolute inset-x-0 bottom-0 h-px" />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold">Brand colours</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {swatches.map((s) => (
            <div key={s.name} className={`rounded-xl p-5 shadow-card ${s.className}`}>
              <div className="h-16" />
              <p className="font-heading font-semibold">{s.name}</p>
              <p className="text-sm opacity-75 tabular">{s.hex}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-16 text-2xl font-bold">Typography</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border p-6">
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Headings · Outfit
            </p>
            <p className="mt-3 font-heading text-4xl font-extrabold text-royal">Royal Ride</p>
            <p className="font-heading text-2xl font-bold">Electric Jeeps &amp; Cars</p>
          </div>
          <div className="rounded-xl border p-6">
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Body · DM Sans
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Built for safety and crafted for joy. Every KING DAY ride is inspected, insured and
              delivered ready to roll.
            </p>
          </div>
        </div>

        <h2 className="mt-16 text-2xl font-bold">Components</h2>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button>Add to cart</Button>
          <Button variant="outline">Wishlist</Button>
          <Button variant="secondary">Compare</Button>
          <Button className="bg-gold text-deep hover:bg-gold-300">
            Buy now <ArrowRight aria-hidden />
          </Button>
          <Badge>New arrival</Badge>
          <Badge variant="secondary">In stock</Badge>
          <Badge className="bg-gold text-deep">-18%</Badge>
        </div>

        <h2 className="mt-16 text-2xl font-bold">Categories</h2>
        <ul className="mt-6 flex flex-wrap gap-2">
          {productCategories.map((c) => (
            <li key={c.slug} className="rounded-full bg-royal-50 px-4 py-2 text-sm font-medium text-royal">
              {c.name}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
