import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Pencil, RotateCcw, Ruler } from "lucide-react";
import { Breadcrumbs } from "@/components/store/page-hero";
import { ProductVisual } from "@/components/store/product-visual";
import { Container } from "@/components/store/section";
import { FinderForm } from "@/components/store/bicycles/finder-form";
import { getBicycleFinderData } from "@/features/catalog/bicycle-queries";
import { ageText, findBicycles, heightText, inchLabel, parseFinder, suitableSizes, type FinderResult } from "@/features/catalog/bicycles";
import { formatPaise } from "@/lib/format";

export const metadata: Metadata = {
  title: "Find Your Perfect Bicycle",
  description: "Answer two quick questions — the rider's age and height — and KING DAY shows the bicycles and wheel sizes that fit.",
  alternates: { canonical: "/bicycle-finder" },
};

function ResultCard({ r }: { r: FinderResult }) {
  const p = r.product;
  const age = r.modelSpecific || !r.size?.modelBased ? ageText(r.fit) : null;
  const height = heightText(r.fit);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-white transition-all hover:-translate-y-0.5 hover:border-royal-100 hover:shadow-lift">
      <ProductVisual image={p.images[0]} categorySlug="cycles" className="aspect-square bg-gradient-to-b from-canvas to-white" />
      {r.size ? (
        <span className="absolute top-2 left-2 rounded-md bg-deep px-2 py-0.5 text-[0.7rem] font-bold text-gold shadow-sm">{inchLabel(r.size.inch)}</span>
      ) : null}
      {p.stock <= 0 ? <span className="absolute top-2 right-2 rounded-md bg-white/90 px-2 py-0.5 text-[0.65rem] font-semibold text-deep">Out of stock</span> : null}
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-deep">
          <Link href={`/products/${p.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">{p.name}</Link>
        </h3>
        <dl className="grid gap-0.5 text-xs text-muted-foreground">
          <div className="flex gap-1"><dt className="font-medium text-deep/80">Wheel:</dt><dd>{r.size ? inchLabel(r.size.inch) : "—"}</dd></div>
          <div className="flex gap-1"><dt className="font-medium text-deep/80">Age:</dt><dd>{age ?? (r.size?.modelBased ? "Ask us for this model" : "—")}</dd></div>
          {height ? <div className="flex gap-1"><dt className="font-medium text-deep/80">Height:</dt><dd>{height}</dd></div> : null}
        </dl>
        {r.note ? <p className="text-[0.7rem] text-royal">{r.note}</p> : null}
        <p className="mt-auto pt-1 text-base font-bold text-deep tabular">{formatPaise(p.price)}</p>
      </div>
    </article>
  );
}

function Grid({ items }: { items: FinderResult[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {items.map((r) => (
        <li key={r.product.id}><ResultCard r={r} /></li>
      ))}
    </ul>
  );
}

async function Finder({ searchParams }: Pick<PageProps<"/bicycle-finder">, "searchParams">) {
  const params = await searchParams;
  const { tree, fits, products } = await getBicycleFinderData();
  const browse = tree.root ? `/categories/${tree.root.slug}` : "/shop";
  if (!tree.types.length) {
    return (
      <p className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">
        The bicycle finder is being set up. <Link href={browse} className="font-semibold text-royal">Browse all bicycles</Link>
      </p>
    );
  }
  const query = parseFinder(params, tree);
  const editing = params.edit === "1";
  const prefill = {
    type: typeof params.type === "string" ? params.type : undefined,
    age: query?.age ?? (Number(params.age) || undefined),
    height: query?.height ?? (Number(params.height) || undefined),
    gender: query?.gender ?? null,
  };
  if (!query || editing) return <FinderForm tree={tree} value={prefill} />;

  const res = findBicycles(tree, products, fits, query);
  const qs = new URLSearchParams({ type: query.type, age: String(query.age), ...(query.height ? { height: String(query.height) } : {}), ...(query.gender ? { gender: query.gender } : {}), edit: "1" });
  const sizes = res.type ? suitableSizes(res.type, query) : [];
  const summary = [res.type?.name, `${query.age} ${query.age === 1 ? "year" : "years"}`, query.height ? `${query.height} cm` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-royal-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-xs font-semibold tracking-wide text-royal uppercase">Your selection</p>
          <p className="mt-0.5 font-bold text-deep">{summary}</p>
          {sizes.length ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Ruler aria-hidden className="size-4 text-gold-600" /> Recommended wheel size: {sizes.map((s) => inchLabel(s.inch)).join(" or ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/bicycle-finder?${qs}`} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-royal bg-white px-4 text-sm font-semibold text-royal hover:bg-royal-50">
            <Pencil aria-hidden className="size-4" /> Edit Selection
          </Link>
          <Link href="/bicycle-finder" className="inline-flex h-10 items-center gap-1.5 rounded-full border bg-white px-4 text-sm font-semibold text-deep hover:border-royal-200">
            <RotateCcw aria-hidden className="size-4" /> Reset
          </Link>
          <Link href={browse} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800">
            Browse All Bicycles <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>

      {res.exact.length ? (
        <section aria-labelledby="fit-heading">
          <h2 id="fit-heading" className="mb-4 text-xl font-extrabold text-deep">
            {res.exact.length} {res.exact.length === 1 ? "bicycle fits" : "bicycles fit"} perfectly
          </h2>
          <Grid items={res.exact} />
        </section>
      ) : (
        <section aria-labelledby="nofit-heading" className="flex flex-col gap-5">
          <div className="rounded-2xl bg-gold-50 p-4 ring-1 ring-gold-200 sm:p-5">
            <h2 id="nofit-heading" className="font-extrabold text-deep">No exact match right now</h2>
            <p className="mt-1 text-sm text-deep/75">
              {res.nearby.length ? "These nearby sizes are the closest fit — or message us and we'll help you choose." : "We don't have a matching bicycle in stock in this type yet."}
            </p>
            {res.otherTypes.length ? (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-deep/75">For age {query.age}, also try:</span>
                {res.otherTypes.map((t) => (
                  <Link key={t.slug} href={`/bicycle-finder?${new URLSearchParams({ type: t.slug, age: String(query.age), ...(query.height ? { height: String(query.height) } : {}) })}`} className="rounded-full bg-white px-3 py-1 font-semibold text-royal ring-1 ring-royal-100 hover:bg-royal hover:text-white">
                    {t.name}
                  </Link>
                ))}
              </p>
            ) : null}
          </div>
          {res.nearby.length ? (
            <div>
              <h3 className="mb-4 text-lg font-bold text-deep">Nearby sizes</h3>
              <Grid items={res.nearby} />
            </div>
          ) : null}
          {res.unrated.length ? (
            <div>
              <h3 className="mb-1 text-lg font-bold text-deep">Ask us about these models</h3>
              <p className="mb-4 text-sm text-muted-foreground">Their age recommendation depends on the model — our team will confirm the fit.</p>
              <Grid items={res.unrated.slice(0, 8)} />
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

export default function BicycleFinderPage(props: PageProps<"/bicycle-finder">) {
  return (
    <>
      <section className="bg-[linear-gradient(135deg,var(--color-deep)_0%,var(--color-royal)_100%)] text-white">
        <Container className="py-8 sm:py-12">
          <Breadcrumbs tone="dark" items={[{ name: "Home", href: "/" }, { name: "Bicycles", href: "/categories/cycles" }, { name: "Find Your Perfect Bicycle" }]} />
          <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">
            Find Your <span className="text-gold">Perfect Bicycle</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/75 sm:text-base">Pick the type, tell us the rider&apos;s age (and height, if you know it). We&apos;ll match the right wheel size.</p>
        </Container>
      </section>
      <Container className="py-6 sm:py-10">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
          <Finder searchParams={props.searchParams} />
        </Suspense>
      </Container>
    </>
  );
}
