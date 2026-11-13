import type { Metadata } from "next";
import Link from "next/link";
import { Crown, HeartHandshake, ShieldCheck, Sparkles } from "lucide-react";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";

export const metadata: Metadata = {
  title: "About Us",
  description: "KING DAY brings premium kids' rides, toys and baby accessories to families who want the best for their little ones.",
  alternates: { canonical: "/about" },
};

const values = [
  { icon: ShieldCheck, title: "Safety, always", body: "We choose every product for build quality, child-safe materials and thoughtful safety features." },
  { icon: Sparkles, title: "Joy in every detail", body: "Rides that look and feel special, from the paint finish to the lights and sounds." },
  { icon: HeartHandshake, title: "Honest help", body: "Straight answers on sizing, age suitability and care, before and after you buy." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        title="About KING DAY"
        description="Every child deserves a royal ride."
        crumbs={[{ name: "Home", href: "/" }, { name: "About Us" }]}
      />
      <Container className="py-12 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            <p className="text-xs font-semibold tracking-[0.2em] text-gold-600 uppercase">Our story</p>
            <h2 className="mt-3 text-3xl font-bold text-deep">Made for little royals and the people who love them</h2>
            <p className="mt-5">
              KING DAY is a premium kids&apos; lifestyle and mobility store. We bring together electric jeeps and cars,
              bikes, scooters, tricycles, bicycles, toys and baby accessories, chosen for families who want the best
              for their children.
            </p>
            <p className="mt-4">
              We believe a first ride is a milestone. That&apos;s why every product we offer has to be safe,
              well-made and worthy of the smile it brings.
            </p>
            <Link href="/shop" className="mt-8 inline-flex h-11 items-center rounded-full bg-royal px-6 text-sm font-semibold text-white hover:bg-royal-800">
              Explore the collection
            </Link>
          </div>
          <div className="relative grid aspect-square max-h-96 place-items-center overflow-hidden rounded-3xl bg-deep">
            <div aria-hidden className="absolute size-3/4 rounded-full border border-gold/30" />
            <div aria-hidden className="absolute size-1/2 rounded-full border border-gold/20" />
            <Crown aria-hidden strokeWidth={1.2} className="relative size-24 text-gold" />
          </div>
        </div>

        <ul className="mt-16 grid gap-4 md:grid-cols-3">
          {values.map((v) => (
            <li key={v.title} className="rounded-2xl border p-6">
              <v.icon aria-hidden className="size-7 text-royal" />
              <h3 className="mt-4 text-lg font-bold text-deep">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
