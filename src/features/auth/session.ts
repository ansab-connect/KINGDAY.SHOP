import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { ACTIONS, ROLE_DEFAULTS, allows, isModule, mergePermissions, type Action, type Module, type Permissions } from "@/features/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * Data-access layer for authentication and authorisation.
 * Every protected page, layout and server action calls one of these.
 * Identity comes from a verified JWT (getClaims), never from client input.
 */

export const STAFF_ROLES = ["super_admin", "admin", "staff"] as const;
export type AppRole = "super_admin" | "admin" | "staff" | "service_staff" | "customer";
export type StaffRole = (typeof STAFF_ROLES)[number];

const roleRank: Record<AppRole, number> = { customer: 0, service_staff: 1, staff: 2, admin: 3, super_admin: 4 };
const roleSchema = z.enum(["super_admin", "admin", "staff", "service_staff", "customer"]);

export type SessionUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  roles: AppRole[];
  /** Highest role held. */
  role: AppRole;
  /** Effective page/action permissions (from the database). */
  permissions: Permissions;
};

/**
 * Returns the signed-in user, or null. Reads cookies: call inside <Suspense>.
 * Cached per request, so layout + page + actions share one lookup.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured) return null;
  // Session checks are always request-time (JWT expiry uses the current time).
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;

  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", sub),
    supabase.from("profiles").select("full_name").eq("id", sub).maybeSingle(),
  ]);

  const roles = (roleRows ?? [])
    .map((r: { role: unknown }) => roleSchema.safeParse(r.role))
    .filter((r) => r.success)
    .map((r) => r.data);
  let permissions: Permissions = {};
  let activeRoles = roles;
  if (roles.some((r) => r !== "customer")) {
    const [{ data: perms, error: permError }, { data: account }] = await Promise.all([
      supabase.rpc("my_permissions"),
      supabase.from("staff_profiles").select("status").eq("user_id", sub).maybeSingle(),
    ]);
    if ((account as { status?: string } | null)?.status === "inactive") {
      // Deactivated: no staff rights anywhere (the database enforces the same).
      activeRoles = roles.filter((r) => r === "customer");
    } else if (permError) {
      // Permissions migration not applied yet: role defaults keep the admin working.
      permissions = mergePermissions(roles.map((r) => ROLE_DEFAULTS[r] ?? {}));
    } else {
      for (const row of (perms ?? []) as { module: unknown; actions: unknown }[]) {
        if (!isModule(row.module) || !Array.isArray(row.actions)) continue;
        permissions[row.module] = row.actions.filter((a): a is Action => (ACTIONS as readonly string[]).includes(a));
      }
    }
  }
  const role = activeRoles.reduce<AppRole>((best, r) => (roleRank[r] > roleRank[best] ? r : best), "customer");

  return {
    id: sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    fullName: (profile as { full_name?: string | null } | null)?.full_name ?? null,
    roles: activeRoles,
    role,
    permissions,
  };
});

export function hasRole(user: SessionUser | null, minimum: StaffRole | "service_staff"): boolean {
  return Boolean(user && roleRank[user.role] >= roleRank[minimum]);
}

/** Page/action permission check for the signed-in user. */
export function can(user: SessionUser | null, module: Module, action: Action = "view"): boolean {
  return allows(user?.permissions, module, action);
}

/** Safe in-app redirect target: relative paths only (blocks open redirects). */
export function safeNextPath(next: unknown, fallback = "/account"): string {
  return typeof next === "string" && /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : fallback;
}

/** Require any signed-in user, otherwise send them to login. */
export async function requireUser(nextPath = "/account"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  return user;
}

export type AdminAccess =
  | { status: "granted"; user: SessionUser }
  | { status: "denied"; user: SessionUser } // signed-in staff without this page's permission
  | { status: "preview" } // development only, Supabase not configured
  | { status: "unconfigured" }; // production without Supabase: always denied

/**
 * Gate for the admin panel. Redirects anonymous users to /admin/login and
 * signed-in users without the required role to /admin/login?error=forbidden.
 */
export async function requireStaff(minimum: StaffRole = "staff", module?: Module): Promise<AdminAccess> {
  if (!isSupabaseConfigured) {
    // Admin pages are never prerendered. Without this, a build with no Supabase keys
    // would treat the gate as static content and fail on routes with URL params.
    await connection();
    return process.env.NODE_ENV === "development" ? { status: "preview" } : { status: "unconfigured" };
  }
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!hasRole(user, minimum)) redirect("/admin/login?error=forbidden");
  if (module && !can(user, module, "view")) return { status: "denied", user };
  return { status: "granted", user };
}

/** For server actions: requires a page/action permission. Throws if missing. */
export async function assertCan(module: Module, action: Action): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "staff") || !can(user, module, action)) throw new Error("Not authorised");
  return user;
}

/** For server actions: throws instead of redirecting. */
export async function assertStaff(minimum: StaffRole = "staff"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!hasRole(user, minimum)) throw new Error("Not authorised");
  return user!;
}
