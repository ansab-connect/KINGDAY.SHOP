import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Pill } from "@/components/admin/status-badge";
import { StaffOnly } from "@/components/admin/staff-only";
import type { Module } from "@/features/auth/permissions";
import { cn } from "@/lib/utils";

const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Paise → "₹297.50" (BEST FIT amounts keep paise). */
export const rupees = (paise: number | string | null | undefined) => (paise == null ? "—" : inr2.format(Number(paise) / 100));
export const km = (v: number | string | null | undefined) => (v == null ? "—" : `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })} km`);
export const day = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const when = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
export const label = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—");
export type SP = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export const param = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

/** Admin page shell: permission gate first, then the header and content. */
export function BfPage({ title, description, module, actions, children }: { title: string; description?: string; module: Module; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <StaffOnly module={module}>
      <PageHeader title={title} description={description} actions={actions} />
      <div className="flex flex-col gap-6">{children}</div>
    </StaffOnly>
  );
}

/** A row of links to related pages that are not in the side menu. */
export function MoreLinks({ links }: { links: [string, string][] }) {
  return (
    <nav aria-label="More pages" className="-mt-2 flex flex-wrap gap-2">
      {links.map(([href, label]) => (
        <a key={href} href={href} className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-royal hover:bg-royal-50">{label}</a>
      ))}
    </nav>
  );
}

export function Panel({ title, description, children, className, aside }: { title?: string; description?: string; children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-card", className)}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-base font-semibold text-deep">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type Col<T> = { key: string; label: string; render?: (r: T) => React.ReactNode; className?: string };
export function DataTable<T extends Record<string, unknown>>({ cols, rows, empty = "Nothing here yet.", rowKey = "id" }: { cols: Col<T>[]; rows: T[]; empty?: string; rowKey?: string }) {
  if (!rows.length) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <tr>{cols.map((c) => <th key={c.key} scope="col" className={cn("px-3 py-2.5", c.className)}>{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={String(r[rowKey] ?? i)} className="align-top hover:bg-muted/30">
              {cols.map((c) => <td key={c.key} className={cn("px-3 py-2.5 text-deep", c.className)}>{c.render ? c.render(r) : String(r[c.key] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stats({ items }: { items: { label: string; value: React.ReactNode; hint?: string; href?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((s) => {
        const body = (
          <>
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-heading text-xl font-bold text-deep tabular-nums">{s.value}</p>
            {s.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p> : null}
          </>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} className="rounded-2xl border bg-card p-4 shadow-card hover:border-royal/40">{body}</Link>
        ) : (
          <div key={s.label} className="rounded-2xl border bg-card p-4 shadow-card">{body}</div>
        );
      })}
    </div>
  );
}

const TONES: Record<string, Parameters<typeof Pill>[0]["tone"]> = {
  new: "warning", unassigned: "warning", assigned: "info", scheduled: "info", accepted: "royal", on_the_way: "royal", reached: "royal",
  inspection_started: "royal", inspection_completed: "royal", started: "royal", awaiting_parts: "warning", completed: "success",
  ready_for_delivery: "success", invoiced: "success", cancelled: "neutral", reassigned: "neutral",
  draft: "neutral", submitted: "warning", under_review: "info", approved: "success", partially_approved: "gold", rejected: "danger", paid: "success",
  published: "success", pending_claim: "gold", claimed: "success", reversed: "danger", issued: "info", void: "neutral", unpaid: "warning", partial: "gold",
  active: "success", inactive: "neutral",
};
export const STATUS_TEXT: Record<string, string> = { new: "Unassigned", reached: "Arrived", started: "Work in progress", pending_claim: "Pending claim" };
export function Status({ s }: { s: string | null | undefined }) {
  if (!s) return <span className="text-muted-foreground">—</span>;
  return <Pill tone={TONES[s] ?? "neutral"}>{STATUS_TEXT[s] ?? label(s)}</Pill>;
}

export function Tabs({ tabs, current }: { tabs: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? "page" : undefined}
          className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", t.key === current ? "border-royal bg-royal text-white" : "bg-white text-deep hover:border-royal/40")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Date range filter (GET form, works without JavaScript). */
export function RangeFilter({ from, to, extra }: { from: string; to: string; extra?: React.ReactNode }) {
  return (
    <form className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1"><span className="font-medium text-deep">From</span><input type="date" name="from" defaultValue={from} className="h-10 rounded-lg border px-3" /></label>
      <label className="flex flex-col gap-1"><span className="font-medium text-deep">To</span><input type="date" name="to" defaultValue={to} className="h-10 rounded-lg border px-3" /></label>
      {extra}
      <button className="h-10 rounded-lg bg-royal px-4 font-semibold text-white">Apply</button>
    </form>
  );
}
export function range(sp: Record<string, string | string[] | undefined>) {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "from")) ? param(sp, "from") : iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "to")) ? param(sp, "to") : iso(now);
  return { from, to };
}

/** CSV export link: the page renders the CSV itself when ?format=csv (see csv route). */
export function CsvLink({ href }: { href: string }) {
  return <a href={href} className="inline-flex h-10 items-center rounded-lg border bg-white px-4 text-sm font-semibold text-deep hover:bg-muted">Export CSV</a>;
}

export type RouteStop = { booking_id: string; booking_code?: string; seq: number; label: string; lat: number | null; lng: number | null; leg_km: number | null; leg_minutes: number | null };

export const mapsDir = (stops: RouteStop[]) => {
  const pts = stops.filter((s) => s.lat != null && s.lng != null).map((s) => `${s.lat},${s.lng}`);
  if (!pts.length) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${pts[pts.length - 1]}${pts.length > 1 ? `&waypoints=${encodeURIComponent(pts.slice(0, -1).join("|"))}` : ""}`;
};

