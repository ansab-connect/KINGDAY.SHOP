import type { Metadata } from "next";
import Link from "next/link";
import { BfPage, DataTable, Panel, Status, day, param, type SP } from "@/components/best-fit/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customer Service Details" };

type B = { id: string; booking_code: string; customer_id: string | null; customer_name: string; mobile: string; category_label: string | null; category: string; status: string; created_at: string; voice_path: string | null; photo_paths: string[] };

/** Every customer with service bookings, grouped (one row per customer, newest first). */
async function Content({ searchParams }: SP) {
  const q = param(await searchParams, "q").replace(/[%,()]/g, "");
  const supabase = await createClient();
  let query = supabase.from("service_bookings").select("id, booking_code, customer_id, customer_name, mobile, category_label, category, status, created_at, voice_path, photo_paths").order("created_at", { ascending: false }).limit(1000);
  if (q) query = query.or(`customer_name.ilike.%${q}%,mobile.ilike.%${q}%,booking_code.ilike.%${q}%`);
  const { data } = await query;
  const groups = new Map<string, B[]>();
  for (const b of (data ?? []) as B[]) {
    const k = b.customer_id ?? b.mobile;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const rows = [...groups.entries()].map(([k, list]) => ({ id: k, list, open: list.filter((b) => !["completed", "invoiced", "ready_for_delivery", "cancelled"].includes(b.status)).length }));
  return (
    <>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Name, mobile or booking ID" className="h-10 w-72 rounded-lg border bg-white px-3 text-sm" /><button className="h-10 rounded-lg bg-royal px-4 text-sm font-semibold text-white">Search</button></form>
      <Panel title={`${rows.length} customers`}>
        <DataTable rows={rows} cols={[
          { key: "c", label: "Customer", render: (r) => <><p className="font-semibold">{r.list[0].customer_name}</p><p className="text-xs text-muted-foreground">{r.list[0].mobile}</p></> },
          { key: "n", label: "Bookings", render: (r) => `${r.list.length} (${r.open} open)` },
          { key: "m", label: "Media", render: (r) => `${r.list.filter((b) => b.voice_path).length} voice · ${r.list.reduce((n, b) => n + b.photo_paths.length, 0)} photos` },
          { key: "l", label: "Bookings", render: (r) => (
            <ul className="flex flex-col gap-1">
              {r.list.slice(0, 5).map((b) => <li key={b.id} className="flex items-center gap-2"><Link href={`/admin/service/${b.id}`} className="font-mono text-xs text-royal">{b.booking_code}</Link><span className="text-xs">{b.category_label ?? b.category}</span><Status s={b.status} /><span className="text-xs text-muted-foreground">{day(b.created_at)}</span></li>)}
            </ul>
          ) },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Customer Service Details" description="Customers, their bookings, photos and voice notes." module="service"><Content {...props} /></BfPage>;
}
