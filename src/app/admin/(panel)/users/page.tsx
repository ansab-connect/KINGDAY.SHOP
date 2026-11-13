import type { Metadata } from "next";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { RoleControls } from "@/components/admin/role-controls";
import { StaffOnly } from "@/components/admin/staff-only";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, hasRole } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Users & roles" };

type Row = { id: string; email: string; full_name: string | null; phone: string | null; created_at: string; last_sign_in_at: string | null; roles: string[] };

const PERMISSIONS = [
  { role: "Super Admin", can: "Everything below, plus grant/revoke roles and read the audit log." },
  { role: "Admin", can: "Store settings, delete catalogue items, view users and roles." },
  { role: "Staff", can: "Products, categories, brands, inventory, orders, customers and reports." },
  { role: "Customer", can: "Their own profile, addresses, wishlist and orders only." },
];

async function UsersContent({ searchParams }: PageProps<"/admin/users">) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : (raw ?? "")).trim().slice(0, 80);
  const me = await getCurrentUser();
  const canManage = hasRole(me, "super_admin");

  let rows: Row[] = [];
  let loadError: string | null = null;
  if (!isSupabaseConfigured) {
    loadError = "User management needs Supabase.";
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_list_users", { p_search: q || null, p_limit: 300 });
    if (error) {
      loadError = /function|schema cache/i.test(error.message)
        ? "The user directory isn't installed yet. Apply migration 20261113001100_audit_and_user_admin.sql in the Supabase SQL editor."
        : "Couldn't load users. Please refresh.";
    } else {
      rows = (data ?? []) as Row[];
    }
  }
  const staff = rows.filter((r) => r.roles.some((x) => x !== "customer"));

  return (
    <>
      <PageHeader
        title="Users & roles"
        description={canManage ? "Grant or revoke admin access. Changes apply immediately and are audit-logged." : "Read-only. Only a Super Admin can change roles."}
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PERMISSIONS.map((p) => (
          <div key={p.role} className="rounded-xl border bg-card p-4 shadow-card">
            <p className="flex items-center gap-2 font-heading text-sm font-semibold text-deep">
              <ShieldCheck aria-hidden className="size-4 text-royal" /> {p.role}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{p.can}</p>
          </div>
        ))}
      </section>

      <form role="search" className="mb-4 flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="Search by email or name" aria-label="Search users" />
        <Button type="submit" variant="outline">Search</Button>
      </form>

      {loadError ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> {loadError}
        </div>
      ) : (
        <Card className="py-0 shadow-card">
          <CardContent className="px-0">
            <p className="border-b px-6 py-3 text-xs text-muted-foreground">
              {rows.length} user{rows.length === 1 ? "" : "s"}{q ? ` matching “${q}”` : ""} · {staff.length} with admin access
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">User</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead className="hidden lg:table-cell">Last sign-in</TableHead>
                  <TableHead className="pr-6">Roles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-12 text-center text-muted-foreground">No users found.</TableCell></TableRow>
                ) : null}
                {[...staff, ...rows.filter((r) => !staff.includes(r))].map((u) => (
                  <TableRow key={u.id} className="align-top">
                    <TableCell className="pl-6">
                      <p className="max-w-56 truncate font-medium text-deep">{u.full_name || "—"}{u.id === me?.id ? " (you)" : ""}</p>
                      <p className="max-w-56 truncate text-xs text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(new Date(u.created_at))}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{u.last_sign_in_at ? formatDate(new Date(u.last_sign_in_at)) : "Never"}</TableCell>
                    <TableCell className="pr-6">
                      <RoleControls userId={u.id} roles={u.roles} canManage={canManage} isSelf={u.id === me?.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

export default function UsersPage(props: PageProps<"/admin/users">) {
  return (
    <StaffOnly minimum="admin">
      <UsersContent {...props} />
    </StaffOnly>
  );
}
