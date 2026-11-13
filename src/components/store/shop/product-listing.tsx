import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX, X } from "lucide-react";
import { ProductGrid } from "@/components/store/product-card";
import { AutoSubmit } from "@/components/store/shop/auto-submit";
import { FilterSheet } from "@/components/store/shop/filter-sheet";
import { getBrands, getCategories, getPriceBounds, getProducts, parseFilters } from "@/features/catalog/queries";
import { SORT_OPTIONS, type ProductFilters } from "@/features/catalog/types";
import { cn } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Fixed constraints of the page hosting the listing (e.g. a category page). */
type Fixed = Pick<ProductFilters, "category" | "onOffer">;

function buildHref(basePath: string, f: ProductFilters, fixed: Fixed, patch: Partial<ProductFilters>) {
  const next = { ...f, ...patch };
  const sp = new URLSearchParams();
  if (next.q) sp.set("q", next.q);
  if (next.category && !fixed.category) sp.set("category", next.category);
  for (const b of next.brands ?? []) sp.append("brand", b);
  if (next.minPrice !== undefined) sp.set("min", String(next.minPrice));
  if (next.maxPrice !== undefined) sp.set("max", String(next.maxPrice));
  if (next.inStock) sp.set("stock", "1");
  if (next.onOffer && !fixed.onOffer) sp.set("offer", "1");
  if (next.sort && next.sort !== "featured") sp.set("sort", next.sort);
  if (next.page && next.page > 1) sp.set("page", String(next.page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export async function ProductListing({
  searchParams,
  basePath,
  fixed = {},
}: {
  searchParams: SearchParams;
  basePath: string;
  fixed?: Fixed;
}) {
  const parsed = parseFilters(await searchParams);
  const filters: ProductFilters = { ...parsed, ...fixed };
  const { items, total, page, pageCount } = getProducts(filters);
  const href = (patch: Partial<ProductFilters>) => buildHref(basePath, filters, fixed, { page: 1, ...patch });

  const categories = getCategories();
  const brands = getBrands();
  const bounds = getPriceBounds();

  const chips: { label: string; href: string }[] = [];
  if (filters.q) chips.push({ label: `“${filters.q}”`, href: href({ q: undefined }) });
  if (filters.category && !fixed.category) {
    chips.push({ label: categories.find((c) => c.slug === filters.category)?.name ?? filters.category, href: href({ category: undefined }) });
  }
  for (const b of filters.brands ?? []) {
    chips.push({ label: brands.find((x) => x.slug === b)?.name ?? b, href: href({ brands: filters.brands?.filter((x) => x !== b) }) });
  }
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    chips.push({ label: `₹${filters.minPrice ?? bounds.min}–₹${filters.maxPrice ?? bounds.max}`, href: href({ minPrice: undefined, maxPrice: undefined }) });
  }
  if (filters.inStock) chips.push({ label: "In stock", href: href({ inStock: false }) });
  if (filters.onOffer && !fixed.onOffer) chips.push({ label: "On offer", href: href({ onOffer: false }) });

  const filterForm = (idPrefix: string) => (
    <form action={basePath} className="flex flex-col gap-7 pt-4">
      <AutoSubmit />
      {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
      {filters.sort && filters.sort !== "featured" ? <input type="hidden" name="sort" value={filters.sort} /> : null}

      {!fixed.category ? (
        <fieldset>
          <legend className="font-heading text-sm font-semibold text-deep">Category</legend>
          <div className="mt-3 flex flex-col gap-2">
            <RadioRow id={`${idPrefix}-cat-all`} name="category" value="" checked={!filters.category} label="All categories" />
            {categories.map((c) => (
              <RadioRow key={c.slug} id={`${idPrefix}-cat-${c.slug}`} name="category" value={c.slug} checked={filters.category === c.slug} label={c.name} count={c.productCount} />
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="font-heading text-sm font-semibold text-deep">Brand</legend>
        <div className="mt-3 flex flex-col gap-2">
          {brands.map((b) => (
            <label key={b.slug} htmlFor={`${idPrefix}-brand-${b.slug}`} className="flex cursor-pointer items-center gap-2.5 text-sm text-deep/80 hover:text-deep">
              <input
                id={`${idPrefix}-brand-${b.slug}`}
                type="checkbox"
                name="brand"
                value={b.slug}
                defaultChecked={filters.brands?.includes(b.slug)}
                className="size-4 rounded accent-royal"
              />
              <span className="flex-1">{b.name}</span>
              <span className="text-xs text-muted-foreground tabular">{b.productCount}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-heading text-sm font-semibold text-deep">Price (₹)</legend>
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor={`${idPrefix}-min`} className="sr-only">Minimum price</label>
          <input id={`${idPrefix}-min`} type="number" name="min" min={0} inputMode="numeric" placeholder={String(bounds.min)} defaultValue={filters.minPrice} className="h-10 w-full rounded-lg border border-input px-3 text-sm outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100" />
          <span aria-hidden className="text-muted-foreground">–</span>
          <label htmlFor={`${idPrefix}-max`} className="sr-only">Maximum price</label>
          <input id={`${idPrefix}-max`} type="number" name="max" min={0} inputMode="numeric" placeholder={String(bounds.max)} defaultValue={filters.maxPrice} className="h-10 w-full rounded-lg border border-input px-3 text-sm outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100" />
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-heading text-sm font-semibold text-deep">Availability</legend>
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={`${idPrefix}-stock`} className="flex cursor-pointer items-center gap-2.5 text-sm text-deep/80">
            <input id={`${idPrefix}-stock`} type="checkbox" name="stock" value="1" defaultChecked={filters.inStock} className="size-4 rounded accent-royal" />
            In stock only
          </label>
          {!fixed.onOffer ? (
            <label htmlFor={`${idPrefix}-offer`} className="flex cursor-pointer items-center gap-2.5 text-sm text-deep/80">
              <input id={`${idPrefix}-offer`} type="checkbox" name="offer" value="1" defaultChecked={filters.onOffer} className="size-4 rounded accent-royal" />
              On offer (15%+ off)
            </label>
          ) : null}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className="h-10 flex-1 rounded-full bg-royal text-sm font-semibold text-white hover:bg-royal-800">Apply</button>
        <Link href={basePath} className="inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium text-deep hover:bg-muted">Reset</Link>
      </div>
    </form>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_1fr] lg:gap-10">
      <aside aria-label="Filters" className="hidden lg:block">
        <div className="sticky top-24">{filterForm("d")}</div>
      </aside>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <FilterSheet activeCount={chips.length}>{filterForm("m")}</FilterSheet>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="font-semibold text-deep tabular">{total}</span> product{total === 1 ? "" : "s"}
          </p>
          <form action={basePath} className="ml-auto flex items-center gap-2">
            <AutoSubmit />
            {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
            {filters.category && !fixed.category ? <input type="hidden" name="category" value={filters.category} /> : null}
            {(filters.brands ?? []).map((b) => <input key={b} type="hidden" name="brand" value={b} />)}
            {filters.minPrice !== undefined ? <input type="hidden" name="min" value={filters.minPrice} /> : null}
            {filters.maxPrice !== undefined ? <input type="hidden" name="max" value={filters.maxPrice} /> : null}
            {filters.inStock ? <input type="hidden" name="stock" value="1" /> : null}
            {filters.onOffer && !fixed.onOffer ? <input type="hidden" name="offer" value="1" /> : null}
            <label htmlFor="sort" className="text-sm text-muted-foreground">Sort</label>
            <select id="sort" name="sort" defaultValue={filters.sort} className="h-10 rounded-full border border-input bg-white pr-8 pl-4 text-sm font-medium text-deep outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100">
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <noscript><button type="submit" className="text-sm text-royal">Go</button></noscript>
          </form>
        </div>

        {chips.length ? (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="inline-flex items-center gap-1.5 rounded-full bg-royal-50 px-3 py-1.5 text-xs font-medium text-royal hover:bg-royal-100">
                  {c.label} <X aria-label="Remove filter" className="size-3.5" />
                </Link>
              </li>
            ))}
            <li><Link href={basePath} className="inline-flex px-2 py-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">Clear all</Link></li>
          </ul>
        ) : null}

        <div className="mt-8">
          {items.length ? (
            <ProductGrid products={items} priorityCount={4} />
          ) : (
            <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
              <SearchX aria-hidden className="size-10 text-royal-300" />
              <p className="mt-4 font-heading text-lg font-semibold text-deep">No products match</p>
              <p className="mt-1 text-sm text-muted-foreground">Try removing a filter or searching for something else.</p>
              <Link href={basePath} className="mt-6 rounded-full bg-royal px-5 py-2.5 text-sm font-semibold text-white">Clear filters</Link>
            </div>
          )}
        </div>

        {pageCount > 1 ? (
          <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1.5">
            <PageLink href={page > 1 ? buildHref(basePath, filters, fixed, { page: page - 1 }) : null} label="Previous page"><ChevronLeft className="size-4" /></PageLink>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={buildHref(basePath, filters, fixed, { page: n })}
                aria-current={n === page ? "page" : undefined}
                className={cn("grid size-10 place-items-center rounded-full text-sm font-medium tabular", n === page ? "bg-royal text-white" : "text-deep hover:bg-muted")}
              >
                {n}
              </Link>
            ))}
            <PageLink href={page < pageCount ? buildHref(basePath, filters, fixed, { page: page + 1 }) : null} label="Next page"><ChevronRight className="size-4" /></PageLink>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function RadioRow({ id, name, value, checked, label, count }: { id: string; name: string; value: string; checked: boolean; label: string; count?: number }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 text-sm text-deep/80 hover:text-deep">
      <input id={id} type="radio" name={name} value={value} defaultChecked={checked} className="size-4 accent-royal" />
      <span className="flex-1">{label}</span>
      {count !== undefined ? <span className="text-xs text-muted-foreground tabular">{count}</span> : null}
    </label>
  );
}

function PageLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  if (!href) {
    return <span aria-hidden className="grid size-10 place-items-center rounded-full text-muted-foreground/40">{children}</span>;
  }
  return <Link href={href} aria-label={label} className="grid size-10 place-items-center rounded-full text-deep hover:bg-muted">{children}</Link>;
}
