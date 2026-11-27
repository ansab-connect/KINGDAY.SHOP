import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { DataTable, Panel, Status, rupees } from "@/components/best-fit/ui";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customer details" };

type P = { id: string; full_name: string | null; phone: string | null; customer_code: string | null; created_at: string };
type A = { id: string; label: string | null; full_name: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; postal_code: string; is_default: boolean };
type O = { id: string; order_number: string; placed_at: string; status: string; payment_method: string; payment_status: string; grand_total: number; coupon_code: string | null };
type B = { id: string; booking_code: string; created_at: string; status: string; category_label: string | null; service_type_label: string | null };
type I = { id: string; invoice_number: string; created_at: string; grand_total: number; payment_status: string; approval_status: string };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: p }, { data: addrs }, { data: orders }, { data: bookings }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, customer_code, created_at").eq("id", id).maybeSingle(),
    supabase.from("addresses").select("id, label, full_name, phone, line1, line2, landmark, city, state, postal_code, is_default").eq("user_id", id).order("is_default", { ascending: false }),
    supabase.from("orders").select("id, order_number, placed_at, status, payment_method, payment_status, grand_total, coupon_code").eq("user_id", id).order("placed_at", { ascending: false }).limit(200),
    supabase.from("service_bookings").select("id, booking_code, created_at, status, category_label, service_type_label").eq("customer_id", id).order("created_at", { ascending: false }).limit(200),
  ]);
  const prof = p as P | null;
  if (!prof) notFound();
  const os = (orders ?? []) as O[];
  const bs = (bookings ?? []) as B[];
  const { data: inv } = bs.length
    ? await supabase.from("service_invoices").select("id, invoice_number, created_at, grand_total, payment_status, approval_status").in("booking_id", bs.map((b) => b.id)).order("created_at", { ascending: false })
    : { data: [] };
  const spent = os.filter((o) => o.status !== "cancelled").reduce((n, o) => n + o.grand_total, 0);
  const addresses = (addrs ?? []) as A[];
  return (
    <>
      <Link href="/admin/customers" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline"><ArrowLeft aria-hidden className="size-4" /> Customers</Link>
      <PageHeader title={prof.full_name || "Customer"} description={`${prof.customer_code ?? ""} · joined ${formatDate(new Date(prof.created_at))}`} />
      <div className="flex flex-col gap-6">
        <Panel title="Details">
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Mobile</dt><dd className="font-medium text-deep">{prof.phone ? <a href={`tel:${prof.phone.replace(/\s/g, "")}`} className="hover:underline">{prof.phone}</a> : "—"}</dd></div>
            <div><dt className="text-muted-foreground">Customer ID</dt><dd className="font-mono text-deep">{prof.customer_code ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Orders · spent</dt><dd className="font-medium text-deep">{os.length} · {rupees(spent)}</dd></div>
            <div><dt className="text-muted-foreground">Service bookings</dt><dd className="font-medium text-deep">{bs.length}</dd></div>
          </dl>
        </Panel>
        <Panel title="Addresses">
          {addresses.length ? (
            <ul className="grid gap-3 text-sm sm:grid-cols-2">
              {addresses.map((a) => (
                <li key={a.id} className="rounded-xl border p-3">
                  <p className="font-semibold text-deep">{a.label || a.full_name}{a.is_default ? <span className="ml-2 text-xs text-success">Default</span> : null}</p>
                  <p className="text-muted-foreground">{a.full_name} · {a.phone}<br />{[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}<br />{a.city}, {a.state} {a.postal_code}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No saved addresses.</p>}
        </Panel>
        <Panel title="Orders">
          <DataTable rows={os} empty="No orders." cols={[
            { key: "n", label: "Order", render: (o) => <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold text-royal hover:underline">{o.order_number}</Link> },
            { key: "d", label: "Date", render: (o) => formatDate(new Date(o.placed_at)) },
            { key: "s", label: "Status", render: (o) => <Status s={o.status} /> },
            { key: "p", label: "Payment", render: (o) => `${o.payment_method === "cod" ? "COD" : "Online"} · ${o.payment_status}` },
            { key: "t", label: "Total", render: (o) => <>{rupees(o.grand_total)}{o.coupon_code ? <span className="block text-xs text-success">Coupon {o.coupon_code}</span> : null}</> },
            { key: "i", label: "", render: (o) => <a href={`/order-invoice/${o.id}`} target="_blank" className="text-sm font-semibold text-royal">Invoice</a> },
          ]} />
        </Panel>
        <Panel title="Service bookings">
          <DataTable rows={bs} empty="No service bookings." cols={[
            { key: "n", label: "Booking", render: (b) => <Link href={`/admin/service/${b.id}`} className="font-mono font-semibold text-royal hover:underline">{b.booking_code}</Link> },
            { key: "d", label: "Date", render: (b) => formatDate(new Date(b.created_at)) },
            { key: "w", label: "Product / service", render: (b) => `${b.category_label ?? ""} · ${b.service_type_label ?? ""}` },
            { key: "s", label: "Status", render: (b) => <Status s={b.status} /> },
          ]} />
        </Panel>
        <Panel title="Service invoices">
          <DataTable rows={(inv ?? []) as I[]} empty="No service invoices." cols={[
            { key: "n", label: "Invoice", render: (i) => <a href={`/service-invoice/${i.id}`} target="_blank" className="font-mono font-semibold text-royal">{i.invoice_number}</a> },
            { key: "d", label: "Date", render: (i) => formatDate(new Date(i.created_at)) },
            { key: "t", label: "Total", render: (i) => rupees(i.grand_total) },
            { key: "s", label: "Status", render: (i) => `${i.approval_status} · ${i.payment_status}` },
          ]} />
        </Panel>
      </div>
    </>
  );
}

export default function CustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <StaffOnly module="customers">
      <Content params={params} />
    </StaffOnly>
  );
}
