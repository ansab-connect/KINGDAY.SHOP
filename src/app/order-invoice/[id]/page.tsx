import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/admin/print-button";
import { Skeleton } from "@/components/ui/skeleton";
import { OFFICIAL_WHATSAPP_DISPLAY, storeContact } from "@/config/storefront";
import { getCurrentUser, hasRole } from "@/features/auth/session";
import { getOrderDetail } from "@/features/orders/queries";
import { formatDate, formatPaise } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tax invoice", robots: { index: false, follow: false } };

type Company = { name?: string; division?: string; gstin?: string; phone?: string; email?: string; address?: string; terms?: string };
type Addr = { full_name?: string | null; phone?: string | null; line1?: string | null; line2?: string | null; landmark?: string | null; city?: string | null; state?: string | null; postal_code?: string | null };

const addrLines = (a: Addr) => [a.line1, a.line2, a.landmark ? `Near ${a.landmark}` : null, [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` – ${a.postal_code}` : "")].filter((x) => x && x.trim());

/** Indian-style amount in words (rupees and paise). */
function inWords(paise: number) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`);
  const three = (n: number) => (n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${two(n % 100)}` : ""}` : two(n));
  const words = (n: number): string => {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    const crore = Math.floor(n / 1e7), lakh = Math.floor((n % 1e7) / 1e5), thousand = Math.floor((n % 1e5) / 1e3), rest = n % 1e3;
    if (crore) parts.push(`${words(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (rest) parts.push(three(rest));
    return parts.join(" ");
  };
  const r = Math.floor(paise / 100), p = paise % 100;
  return `Rupees ${words(r)}${p ? ` and ${two(p)} Paise` : ""} Only`;
}

/**
 * Standard A4 tax invoice for a product order (customer: own orders; staff: all — RLS decides).
 * Billing = the account holder (customer profile and their default address);
 * Shipping = the delivery address typed at checkout. Each line shows the warranty and cycle
 * size saved when the order was placed. "Print / Save as PDF" prints on A4.
 */
async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/order-invoice/${id}`);
  const o = await getOrderDetail(id, { staff: hasRole(me, "staff") });
  if (!o) notFound();
  const supabase = await createClient();
  const { data: ord } = await supabase.from("orders").select("user_id").eq("id", id).maybeSingle();
  const uid = (ord as { user_id: string | null } | null)?.user_id ?? null;
  const [{ data: prof }, { data: addr }, { data: comp }] = await Promise.all([
    uid ? supabase.from("profiles").select("full_name, phone, customer_code").eq("id", uid).maybeSingle() : Promise.resolve({ data: null }),
    uid ? supabase.from("addresses").select("full_name, phone, line1, line2, landmark, city, state, postal_code").eq("user_id", uid).order("is_default", { ascending: false }).order("created_at", { ascending: true }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    // Company details (name, GSTIN) are printed for everyone; the setting itself is staff-only.
    createAdminClient().from("store_settings").select("value").eq("key", "best_fit.company").maybeSingle(),
  ]);
  const profile = prof as { full_name: string | null; phone: string | null; customer_code: string | null } | null;
  const billAddr = (addr as Addr | null) ?? o.shipping_address;
  const company = ((comp as { value: Company } | null)?.value ?? {}) as Company;
  const ship = o.shipping_address as Addr;
  const billName = profile?.full_name || o.customer_name;
  const billPhone = profile?.phone || o.customer_phone;

  return (
    <div className="mx-auto max-w-[210mm] px-4 py-8 print:max-w-none print:p-0">
      {/* A4 page, 12 mm margins (no thermal / small receipt layout). */}
      <style>{`@page { size: A4 portrait; margin: 12mm; } @media print { html, body { background: #fff; } }`}</style>
      <div className="mb-4 flex justify-end print:hidden"><PrintButton /></div>
      <article className="min-h-[297mm] bg-white p-[12mm] text-[12px] leading-snug text-[#1A0F2E] shadow-card print:min-h-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-[#4B0082] pb-4">
          <div className="max-w-[60%]">
            {/* eslint-disable-next-line @next/next/no-img-element -- official logo file, printed */}
            <img src="/brand/kingday-horizontal-color.svg" alt="KING DAY" className="h-11 w-auto" />
            <p className="mt-2 font-semibold">{company.name || "KING DAY"}</p>
            <p className="text-[11px] text-neutral-600">{company.address || storeContact.address}</p>
            <p className="text-[11px] text-neutral-600">Phone: {company.phone || OFFICIAL_WHATSAPP_DISPLAY} · {company.email || storeContact.email}</p>
            {company.gstin ? <p className="text-[11px] font-semibold">GSTIN: {company.gstin}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold tracking-wide text-[#4B0082] uppercase">Tax Invoice</p>
            <table className="mt-2 ml-auto text-[11px]">
              <tbody>
                <tr><td className="pr-3 text-neutral-600">Invoice no.</td><td className="font-mono font-semibold">{o.order_number}</td></tr>
                <tr><td className="pr-3 text-neutral-600">Invoice date</td><td>{formatDate(new Date(o.placed_at))}</td></tr>
                <tr><td className="pr-3 text-neutral-600">Order no.</td><td className="font-mono">{o.order_number}</td></tr>
                <tr><td className="pr-3 text-neutral-600">Payment</td><td>{o.payment_method === "cod" ? "Cash on delivery" : "Online"} · {o.payment_status === "paid" ? "Paid" : o.payment_status}</td></tr>
                {profile?.customer_code ? <tr><td className="pr-3 text-neutral-600">Customer ID</td><td className="font-mono">{profile.customer_code}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </header>

        <section className="grid grid-cols-2 border-b">
          <div className="border-r py-3 pr-4">
            <p className="text-[10px] font-bold tracking-wider text-[#4B0082] uppercase">Billing address</p>
            <p className="mt-1 font-semibold">{billName}</p>
            {addrLines(billAddr as Addr).map((l) => <p key={l}>{l}</p>)}
            <p>Phone: {billPhone}</p>
            {o.customer_email ? <p>{o.customer_email}</p> : null}
          </div>
          <div className="py-3 pl-4">
            <p className="text-[10px] font-bold tracking-wider text-[#4B0082] uppercase">Shipping address</p>
            <p className="mt-1 font-semibold">{ship.full_name || o.customer_name}</p>
            {addrLines(ship).map((l) => <p key={l}>{l}</p>)}
            <p>Phone: {ship.phone || o.customer_phone}</p>
          </div>
        </section>

        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#4B0082] text-left text-white">
              <th className="w-8 px-2 py-1.5 font-semibold">#</th>
              <th className="px-2 py-1.5 font-semibold">Description</th>
              <th className="w-12 px-2 py-1.5 text-right font-semibold">Qty</th>
              <th className="w-24 px-2 py-1.5 text-right font-semibold">Rate</th>
              <th className="w-24 px-2 py-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {o.order_items.map((i, n) => (
              <tr key={i.id} className="border-b align-top">
                <td className="px-2 py-2">{n + 1}</td>
                <td className="px-2 py-2">
                  <p className="font-semibold">{i.product_name}{i.variant_name ? ` – ${i.variant_name}` : ""}</p>
                  <p className="text-[10px] text-neutral-600">SKU: {i.sku}{i.cycle_size ? ` · Size: ${i.cycle_size}` : ""}</p>
                  {i.warranty ? <p className="text-[10px] text-neutral-600">{i.warranty}</p> : null}
                </td>
                <td className="px-2 py-2 text-right">{i.quantity}</td>
                <td className="px-2 py-2 text-right">{formatPaise(i.unit_price)}</td>
                <td className="px-2 py-2 text-right">{formatPaise(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex justify-between gap-6">
          <div className="max-w-[55%] text-[11px]">
            <p className="text-neutral-600">Amount in words</p>
            <p className="font-semibold">{inWords(o.grand_total)}</p>
            {o.customer_note ? <p className="mt-3 text-neutral-600">Note: {o.customer_note}</p> : null}
          </div>
          <table className="w-64 text-[11px] tabular-nums">
            <tbody>
              <tr><td className="py-0.5 text-neutral-600">Subtotal</td><td className="text-right">{formatPaise(o.subtotal)}</td></tr>
              {o.discount_total ? <tr><td className="py-0.5 text-neutral-600">Discount{o.coupon_code ? ` (${o.coupon_code})` : ""}</td><td className="text-right">− {formatPaise(o.discount_total)}</td></tr> : null}
              <tr><td className="py-0.5 text-neutral-600">Delivery</td><td className="text-right">{o.shipping_total ? formatPaise(o.shipping_total) : "Free"}</td></tr>
              {o.tax_total ? <tr><td className="py-0.5 text-neutral-600">Tax</td><td className="text-right">{formatPaise(o.tax_total)}</td></tr> : null}
              <tr className="border-t-2 border-[#4B0082] text-[13px] font-bold"><td className="pt-1.5">Grand total</td><td className="pt-1.5 text-right">{formatPaise(o.grand_total)}</td></tr>
            </tbody>
          </table>
        </div>
        {o.tax_total ? null : <p className="mt-2 text-[10px] text-neutral-600">Prices are inclusive of all applicable taxes.</p>}

        <div className="mt-10 flex items-end justify-between gap-6">
          <div className="max-w-[60%] text-[10px] text-neutral-600">
            <p className="font-semibold text-[#1A0F2E]">Terms</p>
            <p className="whitespace-pre-line">{company.terms || "Warranty terms shown are those applicable on the date of purchase. Goods once sold can be returned only as per the KING DAY return policy."}</p>
          </div>
          <div className="text-center text-[11px]">
            <div className="h-12" />
            <p className="border-t pt-1">Authorised signatory</p>
            <p className="text-[10px] text-neutral-600">for {company.name || "KING DAY"}</p>
          </div>
        </div>

        <footer className="mt-8 flex items-center justify-between border-t pt-2 text-[10px] text-neutral-500">
          <span>This is a computer-generated invoice.</span>
          <span>Powered by <span className="font-semibold text-[#4B0082]">Motherbits Technologies</span></span>
        </footer>
      </article>
    </div>
  );
}

export default function OrderInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="min-h-screen bg-canvas print:bg-white">
      <Suspense fallback={<div className="mx-auto max-w-[210mm] p-8"><Skeleton className="h-[36rem] rounded-2xl" /></div>}>
        <Invoice params={params} />
      </Suspense>
    </main>
  );
}
