import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent } from "@/components/ui/card";
import { employmentLabel } from "@/features/staff/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Staff Management" };

type Row = {
  user_id: string;
  staff_code: string;
  status: string;
  designation: string | null;
  department: string | null;
  employment_type: string;
  staff_categories: { name: string; kind: string } | null;
};

async function StaffContent({ searchParams }: PageProps<"/admin/staff">) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : (sp.q ?? "")).trim().toLowerCase().slice(0, 80);
  const kind = sp.kind === "service" || sp.kind === "staff" ? sp.kind : "all";

  let rows: (Row & { name: string })[] = [];
  let error: string | null = null;
  if (!isSupabaseConfigured) error = "Staff management needs Supabase.";
  else {
    const supabase = await createClient();
    const { data, error: e } = await supabase
      .from("staff_profiles")
      .select("user_id, staff_code, status, designation, department, employment_type, staff_categories(name, kind)")
      .order("staff_code");
    if (e) error = /employment_type|schema cache|does not exist/i.test(e.message) ? "Apply migration 20261114001400_staff_profiles_hr.sql in Supabase first." : "Couldn't load staff.";
    else {
      const list = (data ?? []) as unknown as Row[];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", list.map((r) => r.user_id));
      const names = new Map(((profiles ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? ""]));
      rows = list.map((r) => ({ ...r, name: names.get(r.user_id) || "—" }));
    }
  }
  const shown = rows.filter(
    (r) =>
      (kind === "all" || r.staff_categories?.kind === kind || (kind === "staff" && r.staff_code.startsWith("KD-ADM"))) &&
      (!q || [r.name, r.staff_code, r.designation, r.department, r.staff_categories?.name].some((v) => v?.toLowerCase().includes(q))),
  );

  return (
    <>
      <PageHeader title="Staff Management" description="Employee profiles, employment details and documents. Accounts and access are managed in Users & Roles." />
      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> {error}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Filter" className="flex gap-1">
              {[["all", "All"], ["staff", "Staff"], ["service", "Service Staff"]].map(([k, l]) => (
                <Link
                  key={k}
                  href={{ pathname: "/admin/staff", query: { ...(q ? { q } : {}), ...(k === "all" ? {} : { kind: k }) } }}
                  aria-current={kind === k ? "page" : undefined}
                  className={cn("rounded-full px-3 py-1.5 text-sm font-medium", kind === k ? "bg-royal text-white" : "bg-white text-deep/75 ring-1 ring-border hover:text-royal")}
                >
                  {l}
                </Link>
              ))}
            </nav>
            <form role="search" className="flex gap-2">
              {kind !== "all" ? <input type="hidden" name="kind" value={kind} /> : null}
              <input name="q" defaultValue={q} placeholder="Name, ID, department" aria-label="Search staff" className="h-10 w-full rounded-lg border bg-white px-3 text-sm sm:w-64" />
              <button type="submit" className="h-10 rounded-lg border bg-white px-4 text-sm font-semibold text-deep hover:bg-muted">Search</button>
            </form>
          </div>
          <Card className="py-0 shadow-card">
            <CardContent className="px-0">
              {shown.length === 0 ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">No staff yet. Create accounts in Users &amp; Roles.</p> : null}
              <ul className="divide-y">
                {shown.map((r) => (
                  <li key={r.user_id}>
                    <Link href={`/admin/staff/${r.user_id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40">
                      <span className="w-24 shrink-0 font-mono text-xs font-semibold text-royal">{r.staff_code}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-deep">{r.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{[r.designation, r.staff_categories?.name].filter(Boolean).join(" · ") || "—"}</span>
                      </span>
                      <span className="hidden w-32 truncate text-xs text-muted-foreground md:block">{r.department ?? ""}</span>
                      <span className="hidden w-24 text-xs text-muted-foreground lg:block">{employmentLabel(r.employment_type)}</span>
                      {r.status === "inactive" ? <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">Inactive</span> : null}
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

export default function StaffPage(props: PageProps<"/admin/staff">) {
  return (
    <StaffOnly module="staff">
      <StaffContent {...props} />
    </StaffOnly>
  );
}
