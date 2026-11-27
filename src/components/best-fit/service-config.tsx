import { BaseLocationForm } from "./base-location-form";
import { OpButton, OpForm, type Field } from "@/components/best-fit/op-form";
import { DataTable, Panel, Status } from "@/components/best-fit/ui";
import { can, getCurrentUser } from "@/features/auth/session";
import { getSetting } from "@/features/best-fit/queries";
import { routingProvider } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";

type Mode = { slug: string; title: string; title_ml: string | null; description: string | null; icon: string; kind: string; sort_order: number; is_active: boolean };
const modeFields: Field[] = [
  { name: "title", label: "Title", required: true },
  { name: "title_ml", label: "Title (Malayalam)" },
  { name: "description", label: "Description", wide: true },
  { name: "kind", label: "Kind", type: "select", required: true, options: [{ value: "visit", label: "Technician visits the customer" }, { value: "centre", label: "Customer brings it to a centre" }] },
  { name: "icon", label: "Icon", type: "select", options: [{ value: "home", label: "Home" }, { value: "store", label: "Store" }] },
  { name: "sort_order", label: "Display order", type: "number" },
  { name: "is_active", label: "Active", type: "bool" },
];

type Base = { label: string; lat: number | null; lng: number | null };

/** Extra Service Configuration tabs: service modes, base location, company & invoice details. */
export async function ServiceConfigExtra({ tab, canEdit }: { tab: "modes" | "settings"; canEdit: boolean }) {
  const supabase = await createClient();
  if (tab === "modes") {
    const { data } = await supabase.from("service_modes").select("*").order("sort_order");
    const rows = (data ?? []) as Mode[];
    return (
      <div className="flex flex-col gap-6">
        <Panel title="Service modes" description="“Where would you like your service?” cards on the booking page.">
          <DataTable rows={rows} rowKey="slug" cols={[
            { key: "title", label: "Mode", render: (r) => <><p className="font-semibold">{r.title}</p><p className="text-xs text-muted-foreground">{r.description}</p></> },
            { key: "kind", label: "Kind", render: (r) => (r.kind === "visit" ? "Home visit" : "Service centre") },
            { key: "s", label: "Status", render: (r) => <Status s={r.is_active ? "active" : "inactive"} /> },
            { key: "e", label: "", render: (r) => canEdit ? <details><summary className="cursor-pointer text-sm font-semibold text-royal">Edit</summary><div className="mt-2 w-[min(80vw,600px)]"><OpForm op="mode.update" hidden={{ slug: r.slug }} initial={r} fields={modeFields} /></div></details> : null },
          ]} />
        </Panel>
        {canEdit ? (
          <Panel title="Add a mode">
            <OpForm op="mode.create" fields={[{ name: "slug", label: "Key (a-z, no spaces)", required: true }, ...modeFields]} initial={{ is_active: true, icon: "home", kind: "visit" }} resetOnSuccess />
          </Panel>
        ) : null}
      </div>
    );
  }

  const me = await getCurrentUser();
  const superAdmin = me?.roles.includes("super_admin") ?? false;
  const bestFit = can(me, "best_fit", "edit");
  const [base, pre, parts] = await Promise.all([
    getSetting<Base>("best_fit.base_location", { label: "", lat: null, lng: null }),
    getSetting<{ tax_percent: number }>("best_fit.pre_invoice", { tax_percent: 0 }),
    getSetting<boolean>("best_fit.parts_commission_enabled", false),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <Panel title="KING DAY base location" description="Start point for road distances and routes. Super Admin only.">
        {base.lat == null ? <p className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Exact coordinates are not set yet, so road distances cannot be estimated.</p> : null}
        <p className="mb-3 text-sm text-muted-foreground">Road distances: {routingProvider}.</p>
        {superAdmin ? (
          <BaseLocationForm initial={base} />
        ) : <p className="text-sm text-deep">{base.label} {base.lat != null ? `(${base.lat}, ${base.lng})` : ""}</p>}
      </Panel>
      <Panel title="Company & invoice details" description="Edited in one place: System → Company Details (Super Admin).">
        <a href="/admin/settings/company" className="text-sm font-semibold text-royal hover:underline">Open Company Details</a>
      </Panel>
      {bestFit ? (
        <Panel title="Pre-invoice tax">
          <OpForm op="setting.save" transform="settingValue" hidden={{ key: "best_fit.pre_invoice" }} initial={pre} columns={2} fields={[{ name: "tax_percent", label: "GST % on inspection charge (0 if not applicable)", type: "number", required: true }]} />
        </Panel>
      ) : null}
      <Panel title="Parts / replacement commission" description={`Currently ${parts ? "ON: parts sales are split by the Parts commission rules" : "OFF: parts sales stay 100% with the company"}. Super Admin only.`}>
        {superAdmin ? <ToggleParts on={parts} /> : null}
      </Panel>
    </div>
  );
}

function ToggleParts({ on }: { on: boolean }) {
  return <OpButton op="setting.save" values={{ key: "best_fit.parts_commission_enabled", value: !on }} label={on ? "Switch parts commission OFF" : "Switch parts commission ON"} tone={on ? "danger" : "gold"} confirmText="Change how parts sales are split for newly finalised invoices?" />;
}
