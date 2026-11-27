import type { Metadata } from "next";
import { OpButton, OpForm, type Field } from "@/components/best-fit/op-form";
import { DataTable, Panel, Status } from "@/components/best-fit/ui";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Warranty Management" };

type W = { id: string; name: string; warranty_type: string; coverage: string | null; duration_months: number; description: string | null; sort_order: number; is_active: boolean; warranty_categories: { category_id: string }[]; warranty_brands: { brand_id: string }[] };
type Opt = { id: string; name: string; parent_id?: string | null };

const fields: Field[] = [
  { name: "name", label: "Name (admin only)", required: true, placeholder: "Kids ride-on battery warranty" },
  { name: "coverage", label: "Covers", placeholder: "Battery" },
  { name: "duration_months", label: "Duration (months)", type: "number", required: true, step: "1" },
  { name: "warranty_type", label: "Type", type: "select", required: true, options: [{ value: "limited", label: "Limited Warranty" }] },
  { name: "sort_order", label: "Display order", type: "number", step: "1" },
  { name: "is_active", label: "Active (shown on products)", type: "bool" },
  { name: "description", label: "Notes", wide: true },
];
const label = (w: W) => `${w.duration_months} ${w.duration_months === 1 ? "Month" : "Months"} Limited ${w.coverage ? `${w.coverage} ` : ""}Warranty`;

/** Full path for a category, e.g. "Bicycles › Kids Bicycles". */
function paths(cats: Opt[]) {
  const by = new Map(cats.map((c) => [c.id, c]));
  const path = (c: Opt): string => {
    const parts: string[] = [];
    let cur: Opt | undefined = c;
    for (let i = 0; cur && i < 8; i++) {
      parts.unshift(cur.name);
      cur = cur.parent_id ? by.get(cur.parent_id) : undefined;
    }
    return parts.join(" › ");
  };
  return cats.map((c) => ({ value: c.id, label: path(c) })).sort((a, b) => a.label.localeCompare(b.label));
}

async function Content() {
  const supabase = await createClient();
  const [{ data }, { data: cats }, { data: brands }] = await Promise.all([
    supabase.from("warranties").select("*, warranty_categories(category_id), warranty_brands(brand_id)").order("sort_order").order("name"),
    supabase.from("categories").select("id, name, parent_id").order("name"),
    supabase.from("brands").select("id, name").order("name"),
  ]);
  const rows = (data ?? []) as W[];
  const catOpts = paths((cats ?? []) as Opt[]);
  const brandOpts = ((brands ?? []) as Opt[]).map((b) => ({ value: b.id, label: b.name }));
  const catName = new Map(catOpts.map((o) => [o.value, o.label]));
  const brandName = new Map(brandOpts.map((o) => [o.value, o.label]));
  return (
    <>
      <Panel title="Warranties" description="A warranty applies to every product in its categories (including their subcategories) and of its brands. It shows as one line of small text on the product page, cart, checkout and invoices. Products with no matching warranty (e.g. toys) show nothing. Orders and invoices keep the warranty they were sold with — editing here never changes them.">
        <DataTable rows={rows} empty="No warranties yet." cols={[
          { key: "n", label: "Warranty", render: (w) => <><p className="font-semibold">{label(w)}</p><p className="text-xs text-muted-foreground">{w.name}</p></> },
          { key: "c", label: "Categories", render: (w) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-1">
                {w.warranty_categories.map((c) => (
                  <span key={c.category_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                    {catName.get(c.category_id) ?? "—"}
                    <OpButton op="warrantycat.delete" values={{ warranty_id: w.id, category_id: c.category_id }} label="×" tone="neutral" />
                  </span>
                ))}
              </div>
              <OpForm op="warrantycat.create" hidden={{ warranty_id: w.id }} columns={1} submitLabel="Add category" resetOnSuccess
                fields={[{ name: "category_id", label: "Category", type: "select", required: true, options: catOpts.filter((o) => !w.warranty_categories.some((c) => c.category_id === o.value)) }]} />
            </div>
          ) },
          { key: "b", label: "Brands", render: (w) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-1">
                {w.warranty_brands.map((b) => (
                  <span key={b.brand_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                    {brandName.get(b.brand_id) ?? "—"}
                    <OpButton op="warrantybrand.delete" values={{ warranty_id: w.id, brand_id: b.brand_id }} label="×" tone="neutral" />
                  </span>
                ))}
              </div>
              <OpForm op="warrantybrand.create" hidden={{ warranty_id: w.id }} columns={1} submitLabel="Add brand" resetOnSuccess
                fields={[{ name: "brand_id", label: "Brand", type: "select", required: true, options: brandOpts.filter((o) => !w.warranty_brands.some((b) => b.brand_id === o.value)) }]} />
            </div>
          ) },
          { key: "s", label: "Status", render: (w) => <Status s={w.is_active ? "active" : "inactive"} /> },
          { key: "e", label: "", render: (w) => (
            <div className="flex flex-col gap-2">
              <OpButton op="warranty.update" values={{ id: w.id, is_active: !w.is_active }} label={w.is_active ? "Deactivate" : "Activate"} tone="neutral" />
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-royal">Edit</summary>
                <div className="mt-2 w-[min(80vw,560px)]"><OpForm op="warranty.update" hidden={{ id: w.id }} initial={w} fields={fields} /></div>
              </details>
              <OpButton op="warranty.delete" values={{ id: w.id }} label="Delete" tone="danger" confirmText="Delete this warranty? Existing orders keep their saved warranty." />
            </div>
          ) },
        ]} />
      </Panel>
      <Panel title="Add a warranty" description="After saving, add the categories and/or brands it applies to.">
        <OpForm op="warranty.create" fields={fields} initial={{ warranty_type: "limited", duration_months: 5, is_active: true, sort_order: rows.length + 1 }} resetOnSuccess columns={3} submitLabel="Add warranty" />
      </Panel>
    </>
  );
}

export default function WarrantiesPage() {
  return (
    <StaffOnly minimum="admin" module="products">
      <PageHeader title="Warranty Management" description="Limited warranties by category or brand." />
      <div className="flex flex-col gap-6"><Content /></div>
    </StaffOnly>
  );
}
