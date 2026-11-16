import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = {
  title: { default: "Super Admin", template: "%s · Super Admin | KING DAY" },
  robots: { index: false, follow: false },
};

/**
 * Super Admin area. Same frame as the admin panel, but the layout lets in only
 * Super Admins (Admins are sent back to /admin). Every page also wraps its content in
 * <StaffOnly minimum="super_admin">, and the database enforces the same rules (RLS).
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell minimum="super_admin">{children}</AdminShell>;
}
