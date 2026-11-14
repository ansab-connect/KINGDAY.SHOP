import type { Metadata } from "next";
import { Suspense } from "react";
import { ShieldAlert } from "lucide-react";
import { AdminHeader, type AdminAlert } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin | KING DAY" },
  robots: { index: false, follow: false },
};

/*
 * Every admin page renders inside AdminGate, which verifies the session and the
 * user's role on the server (requireStaff). Server actions re-check with
 * assertStaff(); the database enforces the same rules again through RLS.
 */
async function AdminGate({ children }: { children: React.ReactNode }) {
  const access = await requireStaff("staff");

  if (access.status === "unconfigured") {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/40 p-6">
        <div className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-card">
          <ShieldAlert aria-hidden className="mx-auto size-10 text-danger" />
          <h1 className="mt-4 text-xl font-bold text-deep">Admin unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">Authentication is not configured for this deployment.</p>
        </div>
      </div>
    );
  }

  const user =
    access.status === "granted"
      ? {
          name: access.user.fullName ?? access.user.email ?? "Staff",
          email: access.user.email,
          role: access.user.role,
          access: { permissions: access.user.permissions, isSuperAdmin: access.user.role === "super_admin" },
        }
      : null;

  const alerts = access.status === "granted" ? await getAlerts() : [];

  return (
    <div className="min-h-screen bg-muted/40">
      <AdminSidebar access={user?.access ?? null} />
      <div className="flex min-h-screen flex-col lg:pl-64">
        {access.status === "preview" ? (
          <p role="note" className="bg-deep px-4 py-2 text-center text-xs font-medium text-gold">
            Development preview: Supabase is not configured, so the admin is open locally. It is always locked in production.
          </p>
        ) : null}
        <AdminHeader user={user} alerts={alerts} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

/** Live counts for the header bell. Failures never block the admin shell. */
async function getAlerts(): Promise<AdminAlert[]> {
  try {
    const supabase = await createClient();
    const [orders, stock, unassigned] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["new", "pending", "confirmed", "processing", "packed"]),
      supabase.from("inventory").select("on_hand, reorder_level").limit(5000),
      // RLS returns these only to users who may view service bookings.
      supabase.from("service_bookings").select("id", { count: "exact", head: true }).eq("status", "new").is("assigned_to", null),
    ]);
    const out: AdminAlert[] = [];
    if (unassigned.count) {
      out.push({
        id: "service",
        title: `${unassigned.count} service booking${unassigned.count === 1 ? "" : "s"} need a technician`,
        detail: "New bookings waiting to be assigned",
        href: "/admin/service?status=unassigned",
      });
    }
    if (orders.count) {
      out.push({ id: "orders", title: `${orders.count} order${orders.count === 1 ? "" : "s"} need action`, detail: "New, confirmed or packed orders", href: "/admin/orders" });
    }
    const low = ((stock.data ?? []) as { on_hand: number; reorder_level: number }[]).filter((r) => r.on_hand <= r.reorder_level).length;
    if (low) out.push({ id: "stock", title: `${low} SKU${low === 1 ? "" : "s"} low on stock`, detail: "At or below reorder level", href: "/admin/inventory" });
    return out;
  } catch {
    return [];
  }
}

function AdminShellSkeleton() {
  return (
    <div className="min-h-screen bg-muted/40" aria-busy="true" aria-label="Loading admin">
      <div className="fixed inset-y-0 left-0 hidden w-64 bg-sidebar lg:block" />
      <div className="lg:pl-64">
        <div className="h-16 border-b bg-background" />
        <div className="flex flex-col gap-4 p-8">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
