import Link from "next/link";
import { ArrowRight, Baby, Bike, Sparkles, User, Zap } from "lucide-react";
import type { BicycleTree, BicycleType } from "@/features/catalog/bicycles";
import { cn } from "@/lib/utils";

export function TypeIcon({ type, className }: { type: Pick<BicycleType, "audience" | "slug">; className?: string }) {
  if (type.slug.includes("electric")) return <Zap aria-hidden className={className} />;
  switch (type.audience) {
    case "kids":
      return <Baby aria-hidden className={className} />;
    case "junior":
      return <Sparkles aria-hidden className={className} />;
    case "men":
    case "women":
      return <User aria-hidden className={className} />;
    default:
      return <Bike aria-hidden className={className} />;
  }
}

/** Prominent call to action at the top of every Bicycles page. */
export function FinderBanner({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/bicycle-finder"
      className={cn(
        "group relative mb-6 flex items-center gap-4 overflow-hidden rounded-2xl bg-[linear-gradient(120deg,var(--color-deep)_0%,var(--color-royal)_70%,var(--color-royal-500)_100%)] text-white shadow-lift ring-1 ring-gold/40 transition-transform hover:-translate-y-0.5",
        compact ? "p-4" : "p-5 sm:p-6",
      )}
    >
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-gold text-deep shadow-sm sm:size-14">
        <Bike className="size-6 sm:size-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-extrabold sm:text-lg">Find Your Perfect Bicycle</span>
        <span className="mt-0.5 block text-xs text-white/75 sm:text-sm">Tell us the rider&apos;s age and height — we&apos;ll show the right wheel size.</span>
      </span>
      <span className="hidden h-10 shrink-0 items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-bold text-deep sm:inline-flex">
        Start <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
      <ArrowRight aria-hidden className="size-5 shrink-0 text-gold sm:hidden" />
    </Link>
  );
}

/** Bicycles home: one card per type, its wheel sizes (with age) as clickable chips. */
export function BicycleTypeCards({ tree, current }: { tree: BicycleTree; current?: string }) {
  if (!tree.types.length) return null;
  return (
    <section aria-label="Bicycle types" className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tree.types.map((t) => (
        <article key={t.slug} className={cn("flex flex-col rounded-2xl border bg-white p-4 sm:p-5", current === t.slug ? "border-royal ring-2 ring-royal-100" : "border-border/70")}>
          <Link href={`/categories/${t.slug}`} className="group flex items-center gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-royal-50 text-royal">
              <TypeIcon type={t} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-deep group-hover:text-royal">{t.name}</span>
              <span className="block text-xs text-muted-foreground">{t.productCount} {t.productCount === 1 ? "bicycle" : "bicycles"}</span>
            </span>
            <ArrowRight aria-hidden className="size-4 text-muted-foreground group-hover:text-royal" />
          </Link>
          {t.sizes.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {t.sizes.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/categories/${s.slug}`}
                    className="inline-flex min-h-9 items-center rounded-full border border-royal-100 bg-royal-50/60 px-3 text-xs font-semibold text-deep transition-colors hover:border-royal hover:bg-royal hover:text-white"
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
    </section>
  );
}
