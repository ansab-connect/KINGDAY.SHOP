import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Account row from public.admin_list_accounts (Super Admin and users-view only). */
export type TeamAccount = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  roles: string[];
  staff_code: string | null;
  category_name: string | null;
  status: string;
};

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
  service_staff: "Service Staff",
  customer: "Customer",
};
const RANK = ["super_admin", "admin", "staff", "service_staff", "customer"];
export const mainRole = (roles: string[]) => RANK.find((r) => roles.includes(r)) ?? "customer";

/** Real counts from the database for the Super Admin control centre. */
export async function getControlCentreData() {
  const supabase = await createClient();
  const count = (q: PromiseLike<{ count: number | null; error: unknown }>) => q.then((r) => (r.error ? null : (r.count ?? 0)));
  const roleCount = (role: string) => count(supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", role));

  const [superAdmins, admins, staff, serviceStaff, customers, inactive, audit] = await Promise.all([
    roleCount("super_admin"),
    roleCount("admin"),
    roleCount("staff"),
    roleCount("service_staff"),
    count(supabase.from("profiles").select("id", { count: "exact", head: true }).not("customer_code", "is", null)),
    count(supabase.from("staff_profiles").select("user_id", { count: "exact", head: true }).eq("status", "inactive")),
    supabase.from("audit_logs").select("id, action, entity, entity_id, created_at").order("created_at", { ascending: false }).limit(8),
  ]);

  return {
    counts: { superAdmins, admins, staff, serviceStaff, customers, inactive },
    recentAudit: (audit.data ?? []) as { id: number; action: string; entity: string; entity_id: string | null; created_at: string }[],
  };
}
