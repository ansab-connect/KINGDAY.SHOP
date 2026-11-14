import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { StaffCategoryManager, type StaffCategory } from "@/components/admin/users/account-forms";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser, hasRole } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Users & Roles" };

type Account = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  roles: string[];
  staff_code: string | null;
  category_name: string | null;
  status: string;
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
  service_staff: "Service Staff",
  customer: "Customer",
};
const RANK = ["super_admin", "admin", "staff", "service_staff", "customer"];
const mainRole = (roles: string[]) => RANK.find((r) => roles.includes(r)) ?? "customer";

const FILTERS = [
  { key: "team", label: "Team" },
  { key: "super_admin", label: "Super Admin" },
  { key: "admin", label: "Admin" },
  { key: "staff", label: "Staff" },
  { key: "service_staff", label: "Service Staff" },
  { key: "customer", label: "Customers" },
  { key: "inactive", label: "Inactive" },
] as const;

async function UsersContent({ searchParams }: PageProps<"/admin/users">) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? "")).trim();
  const q = first(sp.q).slice(0, 80);
  const filter = FILTERS.some((f) => f.key === first(sp.show)) ? first(sp.show) : "team";
  const me = await getCurrentUser();
  const canManage = hasRole(me, "super_admin");

  let accounts: Account[] = [];
  let categories: StaffCategory[] = [];
  let loadError: string | null = null;
  if (!isSupabaseConfigured) {
    loadError = "User management needs Supabase.";
  } else {
    const supabase = await createClient();
    const [list, cats] = await Promise.all([
      supabase.rpc("admin_list_accounts", { p_search: q || null, p_limit: 500 }),
      supabase.from("staff_categories").select("id, name, kind, is_system").order("sort_order").order("name"),
    ]);
    if (list.error) {
      loadError = /function|schema cache/i.test(list.error.message)
        ? "Staff accounts aren't installed yet. In the Supabase SQL editor, run 20261114001200_service_staff_role.sql, then 20261114001300_staff_accounts_and_permissions.sql."
        : "Couldn't load users. Please refresh.";
    } else {
      accounts = (list.data ?? []) as Account[];
      categories = (cats.data ?? []) as StaffCategory[];
    }
  }

  const shown = accounts.filter((a) => {
    const role = mainRole(a.roles);
    if (filter === "team") return role !== "customer";
    if (filter === "inactive") return a.status === "inactive";
    return role === filter;
  });
  const teamCount = accounts.filter((a) => mainRole(a.roles) !== "customer").length;

  return (
    <>
      <PageHeader
        title="Users & Roles"
        description={canManage ? "Create staff accounts, set roles and categories, and control what each person can open." : "Read-only. Only a Super Admin can change accounts."}
        actions={
          canManage ? (
            <Link href="/admin/users/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800">
              <UserPlus aria-hidden className="size-4" /> New account
            </Link>
          ) : null
        }
      />

      {loadError ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> {loadError}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav aria-label="Filter accounts" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={{ pathname: "/admin/users", query: { ...(q ? { q } : {}), ...(f.key === "team" ? {} : { show: f.key }) } }}
                  aria-current={filter === f.key ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                    filter === f.key ? "bg-royal text-white" : "bg-white text-deep/75 ring-1 ring-border hover:text-royal",
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </nav>
            <form role="search" className="flex gap-2">
              {filter !== "team" ? <input type="hidden" name="show" value={filter} /> : null}
              <input name="q" defaultValue={q} placeholder="Name, email or staff ID" aria-label="Search accounts" className="h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-sm lg:w-72" />
              <button type="submit" className="h-10 rounded-lg border bg-white px-4 text-sm font-semibold text-deep hover:bg-muted">Search</button>
            </form>
          </div>

          <Card className="py-0 shadow-card">
            <CardContent className="px-0">
              <p className="border-b px-5 py-3 text-xs text-muted-foreground">
                {shown.length} shown · {teamCount} team member{teamCount === 1 ? "" : "s"} · {accounts.length - teamCount} customer{accounts.length - teamCount === 1 ? "" : "s"}
              </p>
              {shown.length === 0 ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">No accounts found.</p> : null}
              <ul className="divide-y">
                {shown.map((a) => {
                  const role = mainRole(a.roles);
                  return (
                    <li key={a.id}>
                      <Link href={`/admin/users/${a.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-royal-50 font-heading text-sm font-bold text-royal">
                          {(a.full_name || a.email).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-deep">
                            {a.full_name || "—"}
                            {a.id === me?.id ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{a.email}</span>
                        </span>
                        <span className="hidden w-28 font-mono text-xs text-muted-foreground md:block">{a.staff_code ?? ""}</span>
                        <span className="hidden w-48 truncate text-xs text-muted-foreground lg:block">{a.category_name ?? ""}</span>
                        <span className="hidden w-28 text-xs text-muted-foreground xl:block">{a.last_sign_in_at ? formatDate(new Date(a.last_sign_in_at)) : "Never signed in"}</span>
                        <span className="flex w-32 flex-col items-end gap-1 sm:flex-row sm:items-center sm:justify-end">
                          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", role === "customer" ? "bg-muted text-muted-foreground" : "bg-royal-50 text-royal")}>
                            {ROLE_LABEL[role]}
                          </span>
                          {a.status === "inactive" ? <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">Inactive</span> : null}
                        </span>
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card className="mt-6 shadow-card">
            <CardContent className="flex flex-col gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold text-deep">Staff categories</h2>
                <p className="text-sm text-muted-foreground">Used when creating Staff and Service Staff accounts. Built-in categories can&apos;t be deleted.</p>
              </div>
              <StaffCategoryManager categories={categories} canManage={canManage} />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

export default function UsersPage(props: PageProps<"/admin/users">) {
  return (
    <StaffOnly module="users">
      <UsersContent {...props} />
    </StaffOnly>
  );
}
