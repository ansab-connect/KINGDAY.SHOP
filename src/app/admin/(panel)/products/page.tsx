import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, ChevronRight, Package, Plus, Search, Star, FileSpreadsheet, X } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { StaffOnly } from "@/components/admin/staff-only";
import { Pill, StockBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClickableRow } from "@/components/admin/clickable-row";
import { ProductActiveSwitch } from "@/components/admin/catalog/product-active-switch";
import { descendantIds, treeOrder } from "@/features/catalog/category-tree";
import { listBrands, listCategories, listProducts, type AdminProductRow } from "@/features/catalog/admin-repo";
import { previewProducts } from "@/features/preview/data";
import { isSupabaseConfigured } from "@/lib/env";
import { discountPercent, formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

const statusTone = { active: "success", draft: "warning", archived: "neutral" } as const;
const statusLabel = { active: "Active", draft: "Draft", archived: "Archived" } as const;
const FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Drafts" },
  { value: "archived", label: "Archived" },
];

type Row = AdminProductRow & { href: string | null };

type Option = { id: string; name: string; parentId: string | null; depth: number };

async function loadOptions(): Promise<{ categories: Option[]; brands: Option[] }> {
  if (!isSupabaseConfigured) return { categories: [], brands: [] };
  const [cats, brands] = await Promise.all([listCategories(), listBrands()]);
  // Parents first, each followed by its sub-categories.
  return {
    // Every level in tree order (Cycles, Electric Cycles, Women, …).
    categories: treeOrder(cats.map((c) => ({ id: c.id, name: c.name, parentId: c.parent_id }))),
    brands: brands.map((b) => ({ id: b.id, name: b.name, parentId: null, depth: 0 })),
  };
}

async function loadRows(q: string, status: string, categoryIds: string[], brandIds: string[]): Promise<Row[]> {
  if (isSupabaseConfigured) {
    return (await listProducts({ q, status, categoryIds, brandIds })).map((p) => ({ ...p, href: `/admin/products/${p.id}` }));
  }
  return previewProducts
    .filter((p) => (!status || p.status === status) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
    .map((p) => ({
      id: p.id, name: p.name, slug: p.id, status: p.status, is_featured: p.featured, category: p.category, brand: p.brand,
      sku: p.sku, variant_count: p.variants, mrp: p.mrp, price: p.price, stock: p.stock, image_url: null, updated_at: "", href: null,
    }));
}

async function ProductsContent({ searchParams }: { searchParams: PageProps<"/admin/products">["searchParams"] }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const status = typeof params.status === "string" && ["active", "draft", "archived"].includes(params.status) ? params.status : "";
  const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
  const cat = list(params.cat);
  const brand = list(params.brand);
  const { categories, brands } = await loadOptions();
  // Picking a main category also includes its sub-categories.
  // Picking a category also includes every level inside it.
  const catIds = [...new Set(cat.flatMap((id) => [id, ...descendantIds(categories, id)]))];
  const rows = await loadRows(q, status, catIds, brand);
  const qs = (next: { status?: string; cat?: string[]; brand?: string[] }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const st = next.status ?? status;
    if (st) sp.set("status", st);
    for (const c of next.cat ?? cat) sp.append("cat", c);
    for (const b of next.brand ?? brand) sp.append("brand", b);
    const str = sp.toString();
    return str ? `/admin/products?${str}` : "/admin/products";
  };
  const nameOf = (opts: Option[], id: string) => opts.find((o) => o.id === id)?.name ?? "Unknown";
  const filtered = cat.length + brand.length > 0;

  return (
    <>
      <PageHeader
        title="Products"
        description={`${rows.length} product${rows.length === 1 ? "" : "s"} · pricing, SKUs, variants and visibility`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/products/import"><FileSpreadsheet aria-hidden /> Import products</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/products/new"><Plus aria-hidden /> Add product</Link>
            </Button>
          </>
        }
      />
      {!isSupabaseConfigured ? <PreviewNotice phase={5} /> : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter by status" className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={qs({ status: f.value })}
              aria-current={status === f.value ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
                status === f.value ? "border-royal bg-royal text-white" : "bg-card text-muted-foreground hover:text-royal",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form action="/admin/products" className="relative sm:w-72" role="search">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          {cat.map((c) => <input key={c} type="hidden" name="cat" value={c} />)}
          {brand.map((b) => <input key={b} type="hidden" name="brand" value={b} />)}
          <label htmlFor="product-search" className="sr-only">Search products</label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input id="product-search" name="q" type="search" defaultValue={q} placeholder="Search by name…" className="h-10 w-full rounded-lg border bg-card pr-3 pl-9 text-sm outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100" />
        </form>
      </div>

      {isSupabaseConfigured ? (
        <form action="/admin/products" className="mb-4 flex flex-wrap items-center gap-2">
          {q ? <input type="hidden" name="q" value={q} /> : null}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <MultiPick label="Categories" name="cat" options={categories} selected={cat} />
          <MultiPick label="Brands" name="brand" options={brands} selected={brand} />
          {cat.map((id) => (
            <Link key={id} href={qs({ cat: cat.filter((x) => x !== id) })} className="inline-flex h-9 items-center gap-1 rounded-full bg-royal-50 px-3 text-sm font-medium text-royal hover:bg-royal-100">
              {nameOf(categories, id)} <X aria-label="Remove" className="size-3.5" />
            </Link>
          ))}
          {brand.map((id) => (
            <Link key={id} href={qs({ brand: brand.filter((x) => x !== id) })} className="inline-flex h-9 items-center gap-1 rounded-full bg-gold-50 px-3 text-sm font-medium text-gold-800 hover:bg-gold-100">
              {nameOf(brands, id)} <X aria-label="Remove" className="size-3.5" />
            </Link>
          ))}
          {filtered ? (
            <Link href={qs({ cat: [], brand: [] })} className="h-9 px-2 text-sm leading-9 font-medium text-muted-foreground hover:text-royal hover:underline">
              Clear filters
            </Link>
          ) : null}
        </form>
      ) : null}

      <Card className="py-0 shadow-card">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Product</TableHead>
                <TableHead className="hidden lg:table-cell">Category</TableHead>
                <TableHead className="hidden text-right sm:table-cell">MRP</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="hidden text-right md:table-cell">Discount</TableHead>
                <TableHead className="hidden sm:table-cell">Stock</TableHead>
                <TableHead className="hidden xl:table-cell">Variants</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10 pr-6"><span className="sr-only">Edit</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-16 text-center">
                    <Package aria-hidden className="mx-auto size-8 text-royal-300" />
                    <p className="mt-3 font-medium text-deep">{q || status ? "No products match" : "No products yet"}</p>
                    <Link href="/admin/products/new" className="mt-2 inline-block text-sm font-medium text-royal hover:underline">Add your first product</Link>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => (
                  <ClickableRow key={p.id} href={p.href}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <span aria-hidden className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-royal-50 font-heading text-sm font-bold text-royal">
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                            <img src={p.image_url} alt="" className="size-full object-cover" />
                          ) : (
                            p.name[0]
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-medium text-deep">
                            {p.href ? (
                              <Link href={p.href} className="max-w-56 truncate hover:text-royal">{p.name}</Link>
                            ) : (
                              <span className="max-w-56 truncate">{p.name}</span>
                            )}
                            {p.is_featured ? <Star aria-label="Featured" className="size-3.5 fill-gold text-gold" /> : null}
                          </p>
                          <p className="text-xs text-muted-foreground">{[p.sku, p.brand].filter(Boolean).join(" · ")}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{p.category}</TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular line-through decoration-muted-foreground/40 sm:table-cell">{p.mrp ? formatPaise(p.mrp) : "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular">{p.price ? formatPaise(p.price) : "—"}</TableCell>
                    <TableCell className="hidden text-right tabular md:table-cell">
                      {p.mrp && p.price ? <span className="font-medium text-gold-700">{discountPercent(p.mrp, p.price)}%</span> : "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell"><StockBadge stock={p.stock} reorderLevel={5} /></TableCell>
                    <TableCell className="hidden tabular xl:table-cell">{p.variant_count}</TableCell>
                    <TableCell>
                      {p.href && p.status !== "archived" ? (
                        <ProductActiveSwitch id={p.id} name={p.name} active={p.status === "active"} />
                      ) : (
                        <Pill tone={statusTone[p.status]}>{statusLabel[p.status]}</Pill>
                      )}
                    </TableCell>
                    <TableCell className="pr-6">{p.href ? <ChevronRight aria-hidden className="size-4 text-muted-foreground" /> : null}</TableCell>
                  </ClickableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

/** Dropdown of checkboxes; "Apply" submits the filter form (works without JavaScript). */
function MultiPick({ label, name, options, selected }: { label: string; name: string; options: Option[]; selected: string[] }) {
  if (!options.length) return null;
  return (
    <details className="group relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium text-deep hover:border-royal-200 [&::-webkit-details-marker]:hidden">
        {label}
        {selected.length ? <span className="rounded-full bg-royal px-1.5 text-xs text-white">{selected.length}</span> : null}
        <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-64 rounded-xl border bg-card p-2 shadow-lift">
        <ul className="max-h-72 overflow-y-auto">
          {options.map((o) => (
            <li key={o.id}>
              <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted", o.depth > 0 && "text-muted-foreground")} style={{ paddingLeft: `${0.5 + o.depth * 1.25}rem` }}>
                <input type="checkbox" name={name} value={o.id} defaultChecked={selected.includes(o.id)} className="size-4 accent-royal" />
                {o.name}
              </label>
            </li>
          ))}
        </ul>
        <button type="submit" className="mt-2 h-9 w-full rounded-lg bg-royal text-sm font-semibold text-white hover:bg-royal-800">Apply</button>
      </div>
    </details>
  );
}

export default function ProductsPage(props: PageProps<"/admin/products">) {
  return (
    <StaffOnly module="products">
      <ProductsContent searchParams={props.searchParams} />
    </StaffOnly>
  );
}
