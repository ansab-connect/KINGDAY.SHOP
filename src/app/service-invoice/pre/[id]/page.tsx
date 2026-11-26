import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { InvoiceShare } from "@/components/service/invoice-share";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";
import { getCurrentUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inspection pre-invoice", robots: { index: false, follow: false } };

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const rs = (p: number) => inr.format(p / 100);

type PI = { id: string; invoice_number: string; booking_id: string; customer_name: string; customer_mobile: string; customer_address: string | null; service_type_label: string | null; service_mode: string; distance_km: number; slab_code: string; slab_min_km: number; slab_max_km: number | null; rate_paise: number; charge_paise: number; tax_percent: number; tax_paise: number; total_paise: number; amount_paid: number; balance: number; payment_status: string; status: string; company: Record<string, string>; created_at: string };

/** Printable inspection PRE-INVOICE (customer, service team and accounts; RLS decides). */
async function PreInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  if (!(await getCurrentUser())) redirect(`/login?next=/service-invoice/pre/${id}`);
  const supabase = await createClient();
  const { data } = await supabase.from("inspection_pre_invoices").select("*").eq("id", id).maybeSingle();
  const p = data as PI | null;
  if (!p) notFound();
  const { data: b } = await supabase.from("service_bookings").select("booking_code").eq("id", p.booking_id).maybeSingle();
  const code = (b as { booking_code?: string } | null)?.booking_code ?? "";
  const c = p.company ?? {};
  const link = `${siteConfig.url}/service-invoice/pre/${p.id}`;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-6 print:hidden"><InvoiceShare whatsappText={`BEST FIT inspection pre-invoice ${p.invoice_number}\nBooking ${code}\nTotal ${rs(p.total_paise)}\nView: ${link}`} phone={p.customer_mobile} /></div>
      {p.status === "void" ? <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">VOID — this pre-invoice was cancelled.</p> : null}
      <article className="rounded-2xl border bg-white p-6 shadow-card sm:p-10 print:rounded-none print:border-0 print:shadow-none">
        <header className="flex flex-col gap-6 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {c.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin-set logo URL
              <img src={c.logo_url} alt="" className="mb-2 h-10" />
            ) : null}
            <p className="font-heading text-xl font-extrabold text-[#4B0082]">BEST FIT</p>
            <p className="text-xs font-semibold text-[#9a7b14]">{c.division || "BEST FIT – Service Division"}</p>
            <p className="mt-2 text-sm font-semibold text-deep">{c.name || "MOTHERBITS TECHNOLOGIES LLP"}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{c.address}{c.gstin ? <><br />GSTIN: {c.gstin}</> : null}{c.phone || c.email ? <><br />{[c.phone, c.email].filter(Boolean).join(" · ")}</> : null}</p>
          </div>
          <div className="sm:text-right">
            <p className="inline-block rounded bg-[#4B0082] px-3 py-1 text-xs font-bold tracking-[0.2em] text-white">PRE-INVOICE</p>
            <p className="mt-2 font-mono text-xl font-bold text-deep">{p.invoice_number}</p>
            <p className="text-sm text-muted-foreground">Date: {new Date(p.created_at).toLocaleDateString("en-IN")}</p>
            <p className="text-sm text-muted-foreground">Service Booking ID: {code}</p>
          </div>
        </header>
        <section className="grid gap-6 border-b py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">Customer</p>
            <p className="mt-1 font-semibold text-deep">{p.customer_name}</p>
            <p className="text-sm text-deep">{p.customer_mobile}</p>
            <p className="text-sm whitespace-pre-line text-deep">{p.customer_address}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">Service</p>
            <p className="mt-1 text-sm text-deep">{p.service_type_label} · {p.service_mode === "centre" ? "Service centre" : "Home service"}</p>
          </div>
        </section>
        <table className="mt-6 w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground uppercase"><th className="py-2">Description</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody className="tabular-nums">
            <tr className="border-b"><td className="py-2.5">Inspection charge — verified one-way road distance {p.distance_km} km × {rs(p.rate_paise)}/km<span className="block text-xs text-muted-foreground">Slab {p.slab_code}: {p.slab_min_km}–{p.slab_max_km ?? "above"} km</span></td><td className="py-2.5 text-right">{rs(p.charge_paise)}</td></tr>
            {p.tax_paise ? <tr className="border-b"><td className="py-2.5">Tax ({p.tax_percent}%)</td><td className="py-2.5 text-right">{rs(p.tax_paise)}</td></tr> : null}
          </tbody>
        </table>
        <dl className="mt-4 ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm tabular-nums">
          <div className="flex justify-between border-t pt-2 text-base font-bold text-deep"><dt>Total</dt><dd>{rs(p.total_paise)}</dd></div>
          {p.amount_paid ? <div className="flex justify-between"><dt className="text-muted-foreground">Paid</dt><dd>− {rs(p.amount_paid)}</dd></div> : null}
          <div className="flex justify-between font-semibold"><dt>Balance</dt><dd>{rs(p.balance)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Payment status</dt><dd className="font-semibold capitalize">{p.payment_status}</dd></div>
        </dl>
        <footer className="mt-8 flex flex-col gap-2 border-t pt-4 text-xs text-muted-foreground">
          {c.payment_instructions ? <p className="whitespace-pre-line text-deep">{c.payment_instructions}</p> : null}
          {c.terms ? <p className="whitespace-pre-line">{c.terms}</p> : null}
          <p>This is a pre-invoice for the inspection visit. Service and parts are billed on the final invoice; this amount is not charged again.</p>
        </footer>
      </article>
    </div>
  );
}

export default function PreInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="min-h-screen bg-canvas print:bg-white">
      <Suspense fallback={<div className="mx-auto max-w-3xl p-8"><Skeleton className="h-[30rem] rounded-2xl" /></div>}>
        <PreInvoice params={params} />
      </Suspense>
    </main>
  );
}
