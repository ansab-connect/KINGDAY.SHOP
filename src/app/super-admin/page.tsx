import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Crown, History, IdCard, KeyRound, LockKeyhole, ShieldCheck, SlidersHorizontal, UserCog, UserX, Users, Wrench } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { StatCard } from "@/components/admin/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getControlCentreData } from "@/features/admin/super-admin";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Control Centre" };

const TOOLS = [
  { href: "/super-admin/admins", icon: ShieldCheck, title: "Admin accounts", text: "Create, deactivate and review Admin and Super Admin accounts." },
  { href: "/super-admin/permissions", icon: KeyRound, title: "Permissions", text: "Default access for Admin, Staff and Service Staff." },
  { href: "/super-admin/settings", icon: SlidersHorizontal, title: "System settings", text: "Password reset rules and other system-wide options." },
  { href: "/admin/password-resets", icon: LockKeyhole, title: "Password resets", text: "Approve or reject forgot-password requests." },
  { href: "/admin/users", icon: UserCog, title: "All users", text: "Staff, technicians and customers, with per-person access." },
  { href: "/admin/audit-log", icon: History, title: "Audit logs", text: "Every important change, who made it and when." },
  { href: "/admin", icon: ArrowRight, title: "Business admin", text: "Products, orders, service and the rest of the store." },
] as const;

const show = (n: number | null) => (n === null ? "—" : formatNumber(n));

async function ControlCentre() {
  if (!isSupabaseConfigured) {
    return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">The Super Admin area needs Supabase.</p>;
  }
  const { counts, recentAudit } = await getControlCentreData();
  return (
    <>
      <PageHeader title="Control Centre" description="Super Admin home: accounts, permissions, system settings and recent activity." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Super Admins" value={show(counts.superAdmins)} icon={Crown} tone="gold" />
        <StatCard label="Admins" value={show(counts.admins)} icon={ShieldCheck} />
        <StatCard label="Staff" value={show(counts.staff)} icon={IdCard} tone="neutral" />
        <StatCard label="Service Staff" value={show(counts.serviceStaff)} icon={Wrench} tone="neutral" />
        <StatCard label="Customers" value={show(counts.customers)} icon={Users} tone="neutral" hint="With a KD-CUS Customer ID" />
        <StatCard label="Inactive team accounts" value={show(counts.inactive)} icon={UserX} tone={counts.inactive ? "warning" : "neutral"} />
      </div>

      <h2 className="mt-8 mb-3 font-heading text-lg font-semibold text-deep">Tools</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="group flex items-start gap-3 rounded-xl border bg-white p-4 shadow-card hover:border-royal/40">
            <t.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-royal" />
            <span className="min-w-0">
              <span className="block font-semibold text-deep group-hover:text-royal">{t.title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{t.text}</span>
            </span>
          </Link>
        ))}
      </div>

      <Card className="mt-8 shadow-card">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAudit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {recentAudit.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 break-words text-deep">
                    <span className="font-medium">{a.action}</span> · {a.entity}
                    {a.entity_id ? <span className="text-muted-foreground"> · {a.entity_id}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(new Date(a.created_at))}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/audit-log" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-royal">
            Full audit log <ArrowRight aria-hidden className="size-4" />
          </Link>
        </CardContent>
      </Card>
    </>
  );
}

export default function SuperAdminHome() {
  return (
    <StaffOnly minimum="super_admin" module="users">
      <ControlCentre />
    </StaffOnly>
  );
}
