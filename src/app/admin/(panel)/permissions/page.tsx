import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { RoleDefaultsForm } from "@/components/admin/users/account-forms";
import { Card, CardContent } from "@/components/ui/card";
import { ACTIONS, isModule, type Action, type Permissions } from "@/features/auth/permissions";
import { getCurrentUser, hasRole } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Permissions" };

const ROLES = [
  { key: "admin", label: "Admin" },
  { key: "staff", label: "Staff" },
  { key: "service_staff", label: "Service Staff" },
] as const;

async function PermissionsContent({ searchParams }: PageProps<"/admin/permissions">) {
  const raw = (await searchParams).role;
  const role = ROLES.find((r) => r.key === (Array.isArray(raw) ? raw[0] : raw))?.key ?? "staff";
  const me = await getCurrentUser();
  if (isSupabaseConfigured && !hasRole(me, "super_admin")) {
    return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Only a Super Admin can change permissions.</p>;
  }

  const value: Permissions = {};
  let loadError = !isSupabaseConfigured;
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("role_permissions").select("module, actions").eq("role", role);
    loadError = Boolean(error);
    for (const r of (data ?? []) as { module: string; actions: string[] }[]) {
      if (isModule(r.module)) value[r.module] = r.actions.filter((a): a is Action => (ACTIONS as readonly string[]).includes(a));
    }
  }

  return (
    <>
      <PageHeader title="Permissions" description="Default page and action access for each role. To give one person different access, open their account in Users & Roles." />
      <div className="mb-4 flex flex-wrap gap-2">
        {ROLES.map((r) => (
          <Link
            key={r.key}
            href={`/admin/permissions?role=${r.key}`}
            aria-current={role === r.key ? "page" : undefined}
            className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", role === r.key ? "bg-royal text-white" : "bg-white text-deep/75 ring-1 ring-border hover:text-royal")}
          >
            {r.label}
          </Link>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-4 py-1.5 text-sm font-semibold text-gold-800">
          <ShieldCheck aria-hidden className="size-4" /> Super Admin: always full access
        </span>
      </div>
      <Card className="shadow-card">
        <CardContent>
          {loadError ? (
            <p className="text-sm text-warning">Permissions aren&apos;t installed yet. Apply the staff-accounts migrations in Supabase first.</p>
          ) : (
            <RoleDefaultsForm key={role} role={role} value={value} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function PermissionsPage(props: PageProps<"/admin/permissions">) {
  return (
    <StaffOnly module="users">
      <PermissionsContent {...props} />
    </StaffOnly>
  );
}
