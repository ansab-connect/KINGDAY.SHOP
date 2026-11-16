import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Crown, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { StatusToggle } from "@/components/admin/users/account-forms";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/features/auth/session";
import { ROLE_LABEL, mainRole, type TeamAccount } from "@/features/admin/super-admin";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin Accounts" };

async function AdminsContent() {
  if (!isSupabaseConfigured) {
    return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Admin accounts need Supabase.</p>;
  }
  const me = await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_accounts", { p_search: null, p_limit: 500 });
  const admins = ((data ?? []) as TeamAccount[])
    .filter((a) => ["super_admin", "admin"].includes(mainRole(a.roles)))
    .sort((a, b) => (mainRole(a.roles) === mainRole(b.roles) ? (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email) : mainRole(a.roles) === "super_admin" ? -1 : 1));

  return (
    <>
      <PageHeader
        title="Admin Accounts"
        description="Admins run the business with the permissions you give them. They can never change a Super Admin."
        actions={
          <Link href="/admin/users/new?role=admin" className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800">
            <UserPlus aria-hidden className="size-4" /> New admin
          </Link>
        }
      />

      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> Couldn&apos;t load accounts. Please refresh.
        </div>
      ) : (
        <Card className="py-0 shadow-card">
          <CardContent className="px-0">
            {admins.length === 0 ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">No admin accounts yet.</p> : null}
            <ul className="divide-y">
              {admins.map((a) => {
                const role = mainRole(a.roles);
                const isMe = a.id === me?.id;
                return (
                  <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                    <Link href={`/admin/users/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-royal">
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full font-heading text-sm font-bold", role === "super_admin" ? "bg-gold-100 text-gold-800" : "bg-royal-50 text-royal")}>
                        {role === "super_admin" ? <Crown aria-hidden className="size-4" /> : (a.full_name || a.email).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-deep">
                          {a.full_name || "—"}
                          {isMe ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.email}
                          {a.staff_code ? ` · ${a.staff_code}` : ""} · {a.last_sign_in_at ? `last sign-in ${formatDate(new Date(a.last_sign_in_at))}` : "never signed in"}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground sm:hidden" />
                    </Link>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", role === "super_admin" ? "bg-gold-100 text-gold-800" : "bg-royal-50 text-royal")}>{ROLE_LABEL[role]}</span>
                      {a.status === "inactive" ? <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">Inactive</span> : null}
                      {/* You can't switch yourself off; the primary Super Admin is also protected in the database. */}
                      <StatusToggle userId={a.id} status={a.status} disabled={isMe} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        To change what one admin can open, open their account and set custom permissions. Role defaults are on{" "}
        <Link href="/super-admin/permissions" className="font-semibold text-royal hover:underline">Permissions</Link>.
      </p>
    </>
  );
}

export default function AdminAccountsPage() {
  return (
    <StaffOnly minimum="super_admin" module="users">
      <AdminsContent />
    </StaffOnly>
  );
}
