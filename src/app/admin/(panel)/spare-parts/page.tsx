import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { SparePartForm, StockForm, type PartRow } from "@/components/admin/service/spare-part-forms";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can, getCurrentUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPaise } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Spare Parts" };

async function Parts({ searchParams }: PageProps<"/admin/spare-parts">) {
  if (!isSupabaseConfigured) return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Needs Supabase.</p>;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const low = sp.show === "low";
  const me = await getCurrentUser();
  const canEdit = can(me, "spare_parts", "edit");
  const canCreate = can(me, "spare_parts", "create");
  const supabase = await createClient();
  let query = supabase.from("spare_parts").select("id, sku, name, category_id, compatible_models, selling_price_paise, stock, low_stock_threshold, is_active").order("name").limit(500);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,sku.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const [{ data, error }, { data: costs }, { data: cats }, { data: pending }] = await Promise.all([
    query,
    supabase.from("spare_part_costs").select("part_id, purchase_price_paise"),
    supabase.from("service_categories").select("id, name").order("sort_order"),
    supabase.from("service_replaced_items").select("id, booking_id, custom_name, quantity, unit_price_paise, master_request, service_bookings(booking_code)").eq("approval_status", "pending").limit(50),
  ]);
  if (error) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> Spare parts aren&apos;t installed yet. Apply migration 20261117002700 in Supabase.
      </div>
    );
  }
  const cost = new Map(((costs ?? []) as { part_id: string; purchase_price_paise: number }[]).map((c) => [c.part_id, c.purchase_price_paise]));
  let parts = ((data ?? []) as Omit<PartRow, "purchase_price_paise">[]).map((p) => ({ ...p, purchase_price_paise: cost.get(p.id) ?? null }));
  const lowCount = parts.filter((p) => p.is_active && p.stock <= p.low_stock_threshold).length;
  if (low) parts = parts.filter((p) => p.is_active && p.stock <= p.low_stock_threshold);
  const categories = (cats ?? []) as { id: string; name: string }[];
  const waiting = (pending ?? []) as unknown as { id: string; booking_id: string; custom_name: string; quantity: number; unit_price_paise: number; master_request: string; service_bookings: { booking_code: string } | null }[];

  return (
    <>
      <PageHeader title="Spare Parts" description="Master list used by technicians on Replaced Items. Prices and stock come from here." />

      {waiting.length ? (
        <Card className="mb-4 border-warning/40 shadow-card">
          <CardHeader>
            <CardTitle>Custom items waiting for approval ({waiting.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {waiting.map((w) => (
                <li key={w.id}>
                  <Link href={`/admin/service/${w.booking_id}`} className="flex items-center gap-3 py-2.5 hover:text-royal">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium text-deep">{w.custom_name}</span> × {w.quantity} · {formatPaise(w.unit_price_paise)} each
                      <span className="block text-xs text-muted-foreground">
                        {w.service_bookings?.booking_code}
                        {w.master_request === "requested" ? " · asked to add to master list" : ""}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {canCreate ? (
        <Card className="mb-4 shadow-card">
          <CardHeader>
            <CardTitle>Add a spare part</CardTitle>
          </CardHeader>
          <CardContent>
            <SparePartForm categories={categories} />
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter" className="flex gap-2">
          <Link href="/admin/spare-parts" aria-current={!low ? "page" : undefined} className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", !low ? "bg-royal text-white" : "bg-white text-deep/75 ring-1 ring-border")}>
            All
          </Link>
          <Link href="/admin/spare-parts?show=low" aria-current={low ? "page" : undefined} className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", low ? "bg-royal text-white" : "bg-white text-deep/75 ring-1 ring-border")}>
            Low stock ({lowCount})
          </Link>
        </nav>
        <form role="search" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Name or SKU" aria-label="Search spare parts" className="h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-sm sm:w-64" />
          <button type="submit" className="h-10 rounded-lg border bg-white px-4 text-sm font-semibold text-deep hover:bg-muted">Search</button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        {parts.length === 0 ? <p className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">No parts found.</p> : null}
        {parts.map((p) => {
          const isLow = p.is_active && p.stock <= p.low_stock_threshold;
          return (
            <details key={p.id} className="group rounded-xl border bg-white shadow-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words text-deep">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.sku}
                    {p.compatible_models ? ` · ${p.compatible_models}` : ""}
                    {!p.is_active ? " · inactive" : ""}
                  </span>
                </span>
                <span className="text-sm tabular">{formatPaise(p.selling_price_paise)}</span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold tabular", isLow ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>{p.stock} in stock</span>
                <ChevronRight aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <div className="flex flex-col gap-4 border-t p-4">
                {canEdit ? (
                  <>
                    <SparePartForm value={p} categories={categories} />
                    <div className="border-t pt-4">
                      <p className="mb-2 text-sm font-semibold text-deep">Stock</p>
                      <StockForm id={p.id} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">You can view parts but not change them.</p>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}

export default function SparePartsPage(props: PageProps<"/admin/spare-parts">) {
  return (
    <StaffOnly module="spare_parts">
      <Parts {...props} />
    </StaffOnly>
  );
}
