import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Pill } from "@/components/admin/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };

type Log = { id: number; actor_id: string | null; action: string; entity: string; entity_id: string | null; details: Record<string, unknown>; created_at: string };

const ENTITIES = ["user_roles", "orders", "store_settings", "products", "categories", "brands"] as const;
const ENTITY_LABEL: Record<string, string> = {
  user_roles: "Roles",
  orders: "Orders",
  store_settings: "Settings",
  products: "Products",
  categories: "Categories",
  brands: "Brands",
};
const ACTION_TONE: Record<string, "success" | "warning" | "info"> = { insert: "success", update: "info", delete: "warning" };
const PAGE = 100;

function summary(l: Log): string {
  const d = l.details ?? {};
  const v = (k: string) => (typeof d[k] === "string" || typeof d[k] === "number" ? String(d[k]) : "");
  switch (l.entity) {
    case "user_roles":
      return `${l.action === "insert" ? "Granted" : "Revoked"} ${v("role").replace("_", " ")}`;
    case "orders":
      return `${v("order_number")} → ${v("status")} · payment ${v("payment_status")}`;
    case "store_settings":
      return `${l.entity_id}: ${JSON.stringify(d.value ?? null)}`;
    default:
      return [v("name"), v("status")].filter(Boolean).join(" · ");
  }
}

async function AuditContent({ searchParams }: PageProps<"/admin/audit-log">) {
  const sp = await searchParams;
  const entityParam = Array.isArray(sp.entity) ? sp.entity[0] : sp.entity;
  const entity: string | null = entityParam && ENTITIES.includes(entityParam as (typeof ENTITIES)[number]) ? entityParam : null;
  const page = Math.max(0, Math.min(1000, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 0));

  let logs: Log[] = [];
  let names = new Map<string, string>();
  let loadError: string | null = null;
  if (!isSupabaseConfigured) {
    loadError = "The audit log needs Supabase.";
  } else {
    const supabase = await createClient();
    let query = supabase.from("audit_logs").select("id, actor_id, action, entity, entity_id, details, created_at").order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
    if (entity) query = query.eq("entity", entity);
    const { data, error } = await query;
    if (error) {
      loadError = /relation|schema cache|does not exist/i.test(error.message)
        ? "The audit log isn't installed yet. Apply migration 20261113001100_audit_and_user_admin.sql in the Supabase SQL editor."
        : "Couldn't load the audit log. Please refresh.";
    } else {
      logs = (data ?? []) as Log[];
      const ids = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        names = new Map(((profiles ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? "Staff member"]));
      }
    }
  }
  const hasMore = logs.length > PAGE;
  const shown = logs.slice(0, PAGE);
  const href = (e: string | null, p = 0) => {
    const q = new URLSearchParams();
    if (e) q.set("entity", e);
    if (p) q.set("page", String(p));
    const s = q.toString();
    return s ? `/admin/audit-log?${s}` : "/admin/audit-log";
  };

  return (
    <>
      <PageHeader title="Audit log" description="Every change to roles, orders, settings and the catalogue. Entries can't be edited or deleted." />
      <nav aria-label="Filter by area" className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {[null, ...ENTITIES].map((e) => (
          <Link
            key={e ?? "all"}
            href={href(e)}
            aria-current={e === entity ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              e === entity ? "border-royal bg-royal text-white" : "bg-card text-muted-foreground hover:text-royal",
            )}
          >
            {e ? ENTITY_LABEL[e] : "All"}
          </Link>
        ))}
      </nav>
      {loadError ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> {loadError}
        </div>
      ) : (
        <Card className="py-0 shadow-card">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead className="hidden pr-6 md:table-cell">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-12 text-center text-muted-foreground">No changes recorded yet.</TableCell></TableRow>
                ) : null}
                {shown.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="pl-6 text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(new Date(l.created_at))}</TableCell>
                    <TableCell className="text-sm">{l.actor_id ? (names.get(l.actor_id) ?? "Staff member") : "System"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Pill tone={ACTION_TONE[l.action] ?? "info"}>{l.action}</Pill>
                        <span className="text-sm">{ENTITY_LABEL[l.entity] ?? l.entity}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-md truncate pr-6 text-xs text-muted-foreground md:table-cell">{summary(l)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <div className="mt-4 flex justify-between text-sm">
        {page > 0 ? <Link href={href(entity, page - 1)} className="font-medium text-royal hover:underline">← Newer</Link> : <span />}
        {hasMore ? <Link href={href(entity, page + 1)} className="font-medium text-royal hover:underline">Older →</Link> : null}
      </div>
    </>
  );
}

export default function AuditLogPage(props: PageProps<"/admin/audit-log">) {
  return (
    <StaffOnly module="audit">
      <AuditContent {...props} />
    </StaffOnly>
  );
}
