import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin | KING DAY" },
  robots: { index: false, follow: false },
};

/*
 * SECURITY NOTE (Phase 4): this layout is NOT yet protected. Before any real data
 * is connected or the site is deployed, admin access will be enforced server-side
 * (Supabase session + user_roles check in a data-access layer called by every
 * admin page and server action). A hidden button or client check is never used.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-screen bg-muted/40">
      <AdminSidebar />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <AdminHeader />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
