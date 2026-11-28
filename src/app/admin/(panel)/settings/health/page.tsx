import type { Metadata } from "next";
import { AiAdvice } from "@/components/admin/ai-advice";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Panel } from "@/components/best-fit/ui";
import { isGeminiConfigured } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "System Health" };

type H = {
  db_bytes: number; storage_bytes: number; storage_files: number; auth_users: number; active_users_30d: number;
  products: number; products_live: number; live_no_photo: number; live_no_stock: number; live_no_short_desc: number;
  orders: number; orders_30d: number; bookings: number; largest_tables: { name: string; bytes: number }[];
};

const MB = 1024 * 1024;
const GB = 1024 * MB;
const size = (b: number) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : `${(b / MB).toFixed(1)} MB`);

/** Supabase plan limits. Free is the default; Pro is shown so the owner knows the next step. */
const LIMITS = [
  { key: "db", label: "Database (all records)", free: 500 * MB, pro: 8 * GB, fmt: size },
  { key: "storage", label: "File storage (photos, voice notes, documents)", free: 1 * GB, pro: 100 * GB, fmt: size },
  { key: "mau", label: "Active accounts (signed in, last 30 days)", free: 50_000, pro: 100_000, fmt: (n: number) => n.toLocaleString("en-IN") },
] as const;

function advice(key: string, pct: number): string {
  if (pct < 60) return "Healthy. Nothing to do.";
  if (key === "db") return pct < 85
    ? "Getting full. Download a backup, then delete very old test orders and old audit entries."
    : "Almost full. Upgrade Supabase to the Pro plan (8 GB) now so the website keeps saving orders.";
  if (key === "storage") return pct < 85
    ? "Getting full. Delete photos of removed products; upload photos under 1 MB each."
    : "Almost full. Upgrade Supabase to Pro (100 GB) so new photos and voice notes can be saved.";
  return pct < 85 ? "Growing fast. Plan an upgrade to Supabase Pro." : "Upgrade Supabase to Pro so customers can keep signing in.";
}

function Bar({ pct }: { pct: number }) {
  const tone = pct < 60 ? "bg-success" : pct < 85 ? "bg-warning" : "bg-danger";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
    </div>
  );
}

async function Content() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("system_health");
  if (error || !data) return <p className="rounded-xl border bg-white p-6 text-sm text-danger">Could not read system health: {error?.message ?? "no data"}</p>;
  const h = data as H;
  const used: Record<string, number> = { db: h.db_bytes, storage: h.storage_bytes, mau: h.active_users_30d };
  const rows = LIMITS.map((l) => ({ ...l, used: used[l.key], pct: (used[l.key] / l.free) * 100 }));
  const worst = Math.max(...rows.map((r) => r.pct));
  const gaps = [
    h.live_no_stock ? `${h.live_no_stock} live product(s) have no stock, so customers can't buy them. Add stock in Inventory.` : null,
    h.live_no_photo ? `${h.live_no_photo} live product(s) have no photo. Add photos in Products.` : null,
    h.live_no_short_desc ? `${h.live_no_short_desc} live product(s) have no short description.` : null,
  ].filter(Boolean) as string[];
  const healthText = [
    ...rows.map((r) => `- ${r.label}: ${r.fmt(r.used)} of ${r.fmt(r.free)} (Free plan) = ${r.pct.toFixed(1)}%.`),
    `- Files stored: ${h.storage_files}. Accounts: ${h.auth_users}. Products: ${h.products} (${h.products_live} live). Orders: ${h.orders} (${h.orders_30d} in 30 days). Service bookings: ${h.bookings}.`,
    `- Live products without stock: ${h.live_no_stock}; without photo: ${h.live_no_photo}; without short description: ${h.live_no_short_desc}.`,
    `- Largest tables: ${h.largest_tables.map((t) => `${t.name} ${size(t.bytes)}`).join(", ")}.`,
  ].join("\n");

  return (
    <div className="flex flex-col gap-6">
      <p className={`rounded-xl p-4 text-sm font-semibold ${worst < 60 ? "bg-success-soft text-success" : worst < 85 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger"}`}>
        {worst < 60 ? "All good. The backend has plenty of room." : worst < 85 ? "Some limits are getting close. See the advice below." : "A limit is almost reached. Act on the advice below today."}
      </p>
      <Panel title="Usage against limits" description="Supabase Free plan limits. On the Pro plan ($25/month) the limits are much higher (shown on the right).">
        <ul className="flex flex-col gap-5">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-semibold text-deep">{r.label}</span>
                <span className="tabular text-muted-foreground">{r.fmt(r.used)} / {r.fmt(r.free)} · {r.pct.toFixed(1)}% <span className="text-xs">(Pro: {r.fmt(r.pro)})</span></span>
              </div>
              <Bar pct={r.pct} />
              <p className="text-xs text-muted-foreground">{advice(r.key, r.pct)}</p>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Records">
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          {[["Products", `${h.products} (${h.products_live} live)`], ["Orders", `${h.orders} (${h.orders_30d} in 30 days)`], ["Service bookings", h.bookings], ["Accounts", h.auth_users], ["Files stored", h.storage_files]].map(([k, v]) => (
            <div key={String(k)}><dt className="text-muted-foreground">{k}</dt><dd className="font-semibold text-deep">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Largest: {h.largest_tables.map((t) => `${t.name} ${size(t.bytes)}`).join(" · ")}</p>
      </Panel>
      <Panel title="Catalogue checks">
        {gaps.length ? <ul className="list-disc pl-5 text-sm text-deep">{gaps.map((g) => <li key={g}>{g}</li>)}</ul> : <p className="text-sm text-success">Every live product has stock, a photo and a short description.</p>}
      </Panel>
      <Panel title="Website hosting (Vercel)" description="Pages are cached and photos are resized automatically, so the site stays fast as products grow.">
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>If photos stop loading or Vercel emails about limits, upgrade Vercel to Pro ($20/month).</li>
          <li>Keep each product photo under 1 MB; the site shrinks them for phones.</li>
        </ul>
      </Panel>
      <Panel title="AI suggestions" description="AI reads your sales, stock, service and the numbers above, then suggests what to do next. No customer names or phone numbers are sent.">
        {isGeminiConfigured() ? <AiAdvice health={healthText} /> : <p className="text-sm text-muted-foreground">Needs a Gemini key in Vercel (GEMINI_API_KEY).</p>}
      </Panel>
    </div>
  );
}

export default function HealthPage() {
  return (
    <StaffOnly minimum="super_admin" module="settings">
      <PageHeader title="System Health" description="How much of the backend is used, how close it is to the limits, and what to do." />
      <Content />
    </StaffOnly>
  );
}
