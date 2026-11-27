import type { Metadata } from "next";
import { OpButton, OpForm, type Field } from "@/components/best-fit/op-form";
import { DataTable, Panel, Status, rupees } from "@/components/best-fit/ui";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Coupons" };

type C = { id: string; code: string; description: string | null; type: "percentage" | "fixed"; value: number; min_order_value: number; max_discount: number | null; expires_at: string | null; usage_limit: number | null; per_customer_limit: number | null; used_count: number; is_active: boolean };

const fields: Field[] = [
  { name: "code", label: "Coupon code (letters/numbers)", required: true, placeholder: "WELCOME10" },
  { name: "type", label: "Discount type", type: "select", required: true, options: [{ value: "percentage", label: "Percentage (%)" }, { value: "fixed", label: "Fixed amount (₹)" }] },
  { name: "value", label: "Discount (% or ₹)", type: "number", required: true, step: "1" },
  { name: "min_order_value", label: "Minimum order (₹, optional)", type: "money" },
  { name: "max_discount", label: "Maximum discount (₹, for %)", type: "money" },
  { name: "expires_at", label: "Expires on (optional)", type: "date" },
  { name: "usage_limit", label: "Total uses allowed (optional)", type: "number", step: "1" },
  { name: "per_customer_limit", label: "Uses per customer (optional)", type: "number", step: "1" },
  { name: "description", label: "Note (admin only)", wide: true },
  { name: "is_active", label: "Active", type: "bool" },
];

async function Content() {
  const supabase = await createClient();
  const { data } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
  const rows = (data ?? []) as C[];
  const off = (c: C) => (c.type === "percentage" ? `${c.value}% off${c.max_discount ? ` (max ${rupees(c.max_discount)})` : ""}` : `${rupees(c.value)} off`);
  return (
    <>
      <Panel title="Coupons" description="Customers type the code at checkout. The discount is checked by the database and shown on the order and invoice with the code.">
        <DataTable rows={rows} empty="No coupons yet." cols={[
          { key: "c", label: "Code", render: (c) => <><p className="font-mono font-bold">{c.code}</p>{c.description ? <p className="text-xs text-muted-foreground">{c.description}</p> : null}</> },
          { key: "o", label: "Discount", render: (c) => <>{off(c)}{c.min_order_value ? <p className="text-xs text-muted-foreground">Min order {rupees(c.min_order_value)}</p> : null}</> },
          { key: "u", label: "Used", render: (c) => `${c.used_count}${c.usage_limit ? ` / ${c.usage_limit}` : ""}` },
          { key: "e", label: "Expires", render: (c) => (c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-IN") : "—") },
          { key: "s", label: "Status", render: (c) => <Status s={c.is_active ? "active" : "inactive"} /> },
          { key: "a", label: "", render: (c) => (
            <div className="flex flex-col gap-2">
              <OpButton op="coupon.update" values={{ id: c.id, is_active: !c.is_active }} label={c.is_active ? "Turn off" : "Turn on"} tone="neutral" />
              {c.used_count === 0 ? <OpButton op="coupon.delete" values={{ id: c.id }} label="Delete" tone="danger" confirmText={`Delete coupon ${c.code}?`} /> : null}
            </div>
          ) },
        ]} />
      </Panel>
      <Panel title="Create a coupon">
        <OpForm op="coupon.create" fields={fields} initial={{ type: "percentage", is_active: true }} resetOnSuccess columns={3} submitLabel="Create coupon" />
      </Panel>
    </>
  );
}

export default function CouponsPage() {
  return (
    <StaffOnly minimum="admin" module="coupons">
      <PageHeader title="Coupons" description="Percentage or fixed discounts with optional limits and expiry." />
      <div className="flex flex-col gap-6"><Content /></div>
    </StaffOnly>
  );
}
