import type { Metadata } from "next";
import { Suspense } from "react";
import { StaffShell } from "@/components/staff/staff-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { requireTeam } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { default: "Staff", template: "%s · Staff | KING DAY" },
  robots: { index: false, follow: false },
};

const ROLE_LABEL: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", staff: "Staff", service_staff: "Service Staff" };

async function Shell({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) {
    return <p className="p-8 text-center text-sm text-muted-foreground">The staff portal needs Supabase.</p>;
  }
  const user = await requireTeam();
  const supabase = await createClient();
  const { data } = await supabase.from("staff_profiles").select("staff_code").eq("user_id", user.id).maybeSingle();
  const code = (data as { staff_code?: string } | null)?.staff_code;
  const adminLink = user.role !== "service_staff" && Object.values(user.permissions).some((a) => a?.includes("view"));
  return (
    <StaffShell name={user.fullName ?? user.email ?? "Staff"} subtitle={[code, ROLE_LABEL[user.role]].filter(Boolean).join(" · ")} adminLink={adminLink}>
      {children}
    </StaffShell>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col gap-4 bg-canvas p-6" aria-busy="true">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      }
    >
      <Shell>{children}</Shell>
    </Suspense>
  );
}
