import type { Metadata } from "next";
import { Suspense } from "react";
import { ShieldAlert } from "lucide-react";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { requireStaff } from "@/features/auth/session";

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
      ? { name: access.user.fullName ?? access.user.email ?? "Staff", email: access.user.email, role: access.user.role }
      : null;

  return (
    <div className="min-h-screen bg-muted/40">
      <AdminSidebar />
      <div className="flex min-h-screen flex-col lg:pl-64">
        {access.status === "preview" ? (
          <p role="note" className="bg-deep px-4 py-2 text-center text-xs font-medium text-gold">
            Development preview: Supabase is not configured, so the admin is open locally. It is always locked in production.
          </p>
        ) : null}
        <AdminHeader user={user} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
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
