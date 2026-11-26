import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { CategoryForm, ItemForm, OptionForm, TypeForm } from "@/components/admin/service/catalog-forms";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, getCurrentUser } from "@/features/auth/session";
import { getServiceCatalog } from "@/features/service/catalog";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ServiceConfigExtra } from "@/components/best-fit/service-config";

export const metadata: Metadata = { title: "Service Configuration" };

const TABS = [
  { key: "options", label: "Booking options" },
  { key: "categories", label: "Categories" },
  { key: "types", label: "Service types" },
  { key: "items", label: "Service items" },
  { key: "modes", label: "Service modes" },
  { key: "settings", label: "Base location & company" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function Row({ title, meta, active, children }: { title: string; meta?: string; active: boolean; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border bg-white shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block font-medium break-words text-deep">{title}</span>
          {meta ? <span className="block text-xs text-muted-foreground">{meta}</span> : null}
        </span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{active ? "Active" : "Off"}</span>
        <ChevronRight aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  );
}

async function Catalog({ searchParams }: PageProps<"/admin/service/catalog">) {
  if (!isSupabaseConfigured) return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Needs Supabase.</p>;
  const raw = (await searchParams).tab;
  const tab: Tab = TABS.find((t) => t.key === raw)?.key ?? "options";
  const me = await getCurrentUser();
  const canEdit = can(me, "service", "edit");
  const { options, categories, types, items } = await getServiceCatalog();
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  return (
    <>
      <Link href="/admin/service" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Service Management
      </Link>
      <PageHeader title="Service Configuration" description="Service types, product categories and service modes shown on the customer booking page. Switch entries off instead of deleting them, so old bookings keep their names." />
      <nav aria-label="Catalog sections" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/service/catalog?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap", tab === t.key ? "bg-royal text-white" : "bg-white text-deep/75 ring-1 ring-border")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "modes" || tab === "settings" ? <ServiceConfigExtra tab={tab} canEdit={canEdit} /> : (
      <>
      {canEdit ? (
        <Card className="mb-4 shadow-card">
          <CardHeader>
            <CardTitle>Add {TABS.find((t) => t.key === tab)!.label.toLowerCase().replace(/s$/, "")}</CardTitle>
            {tab === "options" ? <CardDescription>Options appear as cards on the BEST FIT page, in this order.</CardDescription> : null}
          </CardHeader>
          <CardContent>
            {tab === "options" ? <OptionForm types={types} /> : tab === "categories" ? <CategoryForm categories={categories} /> : tab === "types" ? <TypeForm /> : <ItemForm categories={categories} types={types} />}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2">
        {tab === "options"
          ? options.map((o) => (
              <Row key={o.id} title={o.title} meta={`${o.slug} · ${o.workflow === "booking" ? "Booking form" : "WhatsApp enquiry"} · order ${o.sort_order}`} active={o.is_active}>
                {canEdit ? <OptionForm value={o} types={types} /> : <p className="text-sm text-muted-foreground">{o.description}</p>}
              </Row>
            ))
          : tab === "categories"
            ? categories.map((c) => (
                <Row key={c.id} title={c.parent_id ? `${catName.get(c.parent_id) ?? "—"} › ${c.name}` : c.name} meta={`${c.slug} · order ${c.sort_order}`} active={c.is_active}>
                  {canEdit ? <CategoryForm value={c} categories={categories} /> : <p className="text-sm text-muted-foreground">{c.description}</p>}
                </Row>
              ))
            : tab === "types"
              ? types.map((t) => (
                  <Row
                    key={t.id}
                    title={t.name}
                    meta={`${t.slug} · ${t.base_charge_paise ? formatPaise(t.base_charge_paise) : "charge after inspection"}${t.estimated_minutes ? ` · ~${t.estimated_minutes} min` : ""}`}
                    active={t.is_active}
                  >
                    {canEdit ? <TypeForm value={t} /> : <p className="text-sm text-muted-foreground">{t.description}</p>}
                  </Row>
                ))
              : items.length === 0
                ? [<p key="none" className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">No service items yet. Add fixed-price jobs here (for example, “Jeep wheel alignment”).</p>]
                : items.map((i) => (
                    <Row
                      key={i.id}
                      title={i.name}
                      meta={[i.category_id ? catName.get(i.category_id) : "Any category", i.service_type_id ? typeName.get(i.service_type_id) : null, formatPaise(i.charge_paise)].filter(Boolean).join(" · ")}
                      active={i.is_active}
                    >
                      {canEdit ? <ItemForm value={i} categories={categories} types={types} /> : <p className="text-sm text-muted-foreground">{i.description}</p>}
                    </Row>
                  ))}
      </div>
      </>
      )}
    </>
  );
}

export default function ServiceCatalogPage(props: PageProps<"/admin/service/catalog">) {
  return (
    <StaffOnly module="service">
      <Catalog {...props} />
    </StaffOnly>
  );
}
