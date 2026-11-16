import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PasswordResetReview } from "@/components/admin/password-reset-review";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent } from "@/components/ui/card";
import { can, getCurrentUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Password Reset Requests" };

type Req = {
  id: string;
  request_code: string;
  user_id: string;
  login_kind: "mobile" | "email";
  contact: string;
  user_name: string | null;
  customer_code: string | null;
  status: "pending" | "approved" | "rejected" | "completed" | "expired";
  requested_at: string;
  expires_at: string;
  reviewed_at: string | null;
  admin_note: string | null;
  completed_at: string | null;
  sessions_revoked: boolean | null;
};

const STATUS: Record<Req["status"], { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-gold-100 text-gold-800" },
  approved: { label: "Approved (not applied)", cls: "bg-warning-soft text-warning" },
  rejected: { label: "Rejected", cls: "bg-danger-soft text-danger" },
  completed: { label: "Completed", cls: "bg-success-soft text-success" },
  expired: { label: "Expired", cls: "bg-muted text-muted-foreground" },
};
const FILTERS = [
  { key: "open", label: "Waiting" },
  { key: "history", label: "History" },
] as const;

async function Content({ searchParams }: PageProps<"/admin/password-resets">) {
  if (!isSupabaseConfigured) return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Needs Supabase.</p>;
  const show = (await searchParams).show === "history" ? "history" : "open";
  const me = await getCurrentUser();
  const canReview = me?.role === "super_admin" || can(me, "password_resets", "approve");
  const supabase = await createClient();
  await supabase.rpc("expire_password_resets");
  const { data, error } = await supabase
    .from("password_reset_requests")
    .select("id, request_code, user_id, login_kind, contact, user_name, customer_code, status, requested_at, expires_at, reviewed_at, admin_note, completed_at, sessions_revoked")
    .in("status", show === "open" ? ["pending", "approved"] : ["rejected", "completed", "expired"])
    .order("requested_at", { ascending: false })
    .limit(200);
  const list = (data ?? []) as Req[];

  return (
    <>
      <PageHeader title="Password Reset Requests" description="Customers and staff who forgot their password. Confirm it's really them, then approve." />
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-royal/20 bg-royal-50/60 p-4 text-sm text-deep">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-royal" />
        <p>
          Before approving, call the registered mobile number and confirm the person asked for it. You never see their old or new password. Approving switches the new password on and signs them out of every device; rejecting keeps the old password.
        </p>
      </div>
      <nav aria-label="Filter" className="mb-3 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "open" ? "/admin/password-resets" : "/admin/password-resets?show=history"}
            aria-current={show === f.key ? "page" : undefined}
            className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", show === f.key ? "bg-royal text-white" : "bg-white text-deep/75 ring-1 ring-border")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> Password resets aren&apos;t installed yet. Apply migration 20261117002500 in Supabase.
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground">{show === "open" ? "No requests waiting." : "No past requests."}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((r) => (
            <Card key={r.id} className="shadow-card">
              <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{r.request_code}</span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
                  </p>
                  <p className="mt-1 font-semibold break-words text-deep">
                    {r.user_name ?? "Unnamed account"}
                    {r.customer_code ? <span className="font-normal text-muted-foreground"> · {r.customer_code}</span> : null}
                  </p>
                  <p className="text-sm break-words text-muted-foreground">
                    {r.login_kind === "mobile" ? "Mobile" : "Email"}: {r.contact}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Requested {formatDateTime(new Date(r.requested_at))}
                    {r.status === "pending" || r.status === "approved" ? ` · expires ${formatDateTime(new Date(r.expires_at))}` : ""}
                    {r.reviewed_at ? ` · reviewed ${formatDateTime(new Date(r.reviewed_at))}` : ""}
                    {r.completed_at ? ` · applied ${formatDateTime(new Date(r.completed_at))}${r.sessions_revoked === false ? " (sessions not revoked)" : ""}` : ""}
                  </p>
                  {r.admin_note ? <p className="mt-1 text-sm break-words text-deep">Note: {r.admin_note}</p> : null}
                  <Link href={`/admin/users/${r.user_id}`} className="mt-1 inline-block text-sm font-semibold text-royal hover:underline">
                    Open account
                  </Link>
                </div>
                {canReview && (r.status === "pending" || r.status === "approved") && r.user_id !== me?.id ? (
                  <div className="w-full lg:w-80">
                    <PasswordResetReview id={r.id} retry={r.status === "approved"} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export default function PasswordResetsPage(props: PageProps<"/admin/password-resets">) {
  return (
    <StaffOnly module="password_resets">
      <Content {...props} />
    </StaffOnly>
  );
}
