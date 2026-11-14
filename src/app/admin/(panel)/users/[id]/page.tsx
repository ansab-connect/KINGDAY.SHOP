import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import {
  AccountForm,
  DeleteAccount,
  SetupLinkButton,
  StatusToggle,
  UserPermissionsForm,
  type StaffCategory,
} from "@/components/admin/users/account-forms";
import { Card, CardContent } from "@/components/ui/card";
import { ACTIONS, isModule, mergePermissions, type Action, type Permissions } from "@/features/auth/permissions";
import { getCurrentUser, hasRole } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

const PRIMARY_EMAIL = "kingdaystore@gmail.com";
const RANK = ["super_admin", "admin", "staff", "service_staff", "customer"];
const ROLE_LABEL: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", staff: "Staff", service_staff: "Service Staff", customer: "Customer" };

function toPermissions(rows: { module: string; actions: string[] }[]): Permissions {
  const out: Permissions = {};
  for (const r of rows) if (isModule(r.module)) out[r.module] = r.actions.filter((a): a is Action => (ACTIONS as readonly string[]).includes(a));
  return out;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-card">
      <CardContent className="flex flex-col gap-4">
        <div>
          <h2 className="font-heading text-lg font-semibold text-deep">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

async function AccountContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !isSupabaseConfigured) notFound();
  const me = await getCurrentUser();
  const canManage = hasRole(me, "super_admin");
  const supabase = await createClient();

  let email = "";
  let lastSignIn: string | null = null;
  let createdAt: string | null = null;
  let lookedUp = false;
  let found = false;
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(id);
    lookedUp = true;
    found = Boolean(data.user);
    email = data.user?.email ?? "";
    lastSignIn = data.user?.last_sign_in_at ?? null;
    createdAt = data.user?.created_at ?? null;
  } catch {
    // Server key missing: show what the database allows.
  }
  if (lookedUp && !found) notFound();

  const [{ data: profile }, { data: roleRows }, { data: staff }, { data: cats }, { data: userPerms }, { data: roleDefaults }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", id),
    supabase.from("staff_profiles").select("staff_code, category_id, status, custom_permissions, designation, joining_date").eq("user_id", id).maybeSingle(),
    supabase.from("staff_categories").select("id, name, kind, is_system").order("sort_order").order("name"),
    supabase.from("user_permissions").select("module, actions").eq("user_id", id),
    supabase.from("role_permissions").select("role, module, actions"),
  ]);
  if (!profile && !roleRows?.length) notFound();

  const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
  const role = RANK.find((r) => roles.includes(r)) ?? "customer";
  const s = staff as { staff_code: string; category_id: string | null; status: string; custom_permissions: boolean; designation: string | null; joining_date: string | null } | null;
  const categories = (cats ?? []) as StaffCategory[];
  const isPrimary = email.toLowerCase() === PRIMARY_EMAIL;
  const isSelf = id === me?.id;
  const defaults = mergePermissions(
    roles.map((r) => toPermissions(((roleDefaults ?? []) as { role: string; module: string; actions: string[] }[]).filter((x) => x.role === r))),
  );
  const status = s?.status ?? "active";
  const category = categories.find((c) => c.id === s?.category_id);
  const p = profile as { full_name: string | null; phone: string | null } | null;

  return (
    <>
      <Link href="/admin/users" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Users &amp; Roles
      </Link>
      <PageHeader title={p?.full_name || email || "Account"} description={[email, s?.staff_code].filter(Boolean).join(" · ")} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Role", ROLE_LABEL[role]],
          ["Staff ID", s?.staff_code ?? "—"],
          ["Category", category?.name ?? "—"],
          ["Status", status === "inactive" ? "Inactive" : "Active"],
          ["Last sign-in", lastSignIn ? formatDate(new Date(lastSignIn)) : "Never"],
          ["Joined", createdAt ? formatDate(new Date(createdAt)) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-white p-4 shadow-card">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className={`mt-1 font-semibold ${k === "Status" && v === "Inactive" ? "text-danger" : "text-deep"}`}>{v}</p>
          </div>
        ))}
      </div>

      {canManage ? (
        <div className="flex flex-col gap-6">
          <Section title="Account details">
            <AccountForm
              categories={categories}
              lockRole={isPrimary || isSelf}
              account={{
                userId: id,
                fullName: p?.full_name ?? "",
                email,
                phone: p?.phone ?? "",
                role: role === "customer" ? "staff" : role,
                categoryId: s?.category_id ?? "",
                designation: s?.designation ?? "",
                joiningDate: s?.joining_date ?? "",
              }}
            />
          </Section>

          {role !== "super_admin" ? (
            <Section title="Page & action permissions" description="Choose what this person can open and do. Role defaults are edited on the Permissions page.">
              <UserPermissionsForm
                userId={id}
                custom={Boolean(s?.custom_permissions)}
                current={toPermissions((userPerms ?? []) as { module: string; actions: string[] }[])}
                roleDefaults={defaults}
              />
            </Section>
          ) : (
            <Section title="Page & action permissions" description="Super Admins always have full access." >
              <p className="text-sm text-muted-foreground">No restrictions apply to this role.</p>
            </Section>
          )}

          <Section title="Sign-in" description="Create a one-time link the person opens to set a new password. Share it privately (for example on WhatsApp).">
            <SetupLinkButton userId={id} />
          </Section>

          <Section title="Account status" description="Inactive accounts can't sign in and lose all staff access at once. Their records are kept.">
            <StatusToggle userId={id} status={status} disabled={isPrimary || isSelf} />
          </Section>

          {!isPrimary && !isSelf ? (
            <Section title="Delete account" description="Permanently removes the sign-in. Orders and audit history are kept. This can't be undone; prefer Deactivate.">
              <DeleteAccount userId={id} />
            </Section>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Read-only. Only a Super Admin can change accounts.</p>
      )}
    </>
  );
}

export default function AccountPage(props: PageProps<"/admin/users/[id]">) {
  return (
    <StaffOnly module="users">
      <AccountContent params={props.params} />
    </StaffOnly>
  );
}
