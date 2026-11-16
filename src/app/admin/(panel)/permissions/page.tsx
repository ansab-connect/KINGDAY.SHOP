import { redirect } from "next/navigation";

/** Permissions moved to the Super Admin area (Update 01, Phase 03). */
export default function OldPermissionsPage() {
  redirect("/super-admin/permissions");
}
