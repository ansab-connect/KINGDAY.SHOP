"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { ACTIONS, MODULE_KEYS, type Action, type Module } from "@/features/auth/permissions";
import { assertStaff, type SessionUser } from "@/features/auth/session";
import { dbMessage, fail, fieldErrorsOf, ok, type FormState } from "@/features/forms";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Account management (Super Admin only).
 * Database rows (roles, staff profile, permissions) are written as the signed-in
 * Super Admin, so RLS and the audit log apply. Only sign-in records (auth.users:
 * create, ban, delete, setup links) use the service-role client, after the check.
 */

const PRIMARY_EMAIL = "kingdaystore@gmail.com";
const ACCOUNT_ROLES = ["super_admin", "admin", "staff", "service_staff"] as const;
type AccountRole = (typeof ACCOUNT_ROLES)[number];
const BAN_FOREVER = "876000h"; // ~100 years

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

async function superAdmin(): Promise<SessionUser | FormState> {
  if (!isSupabaseConfigured) return fail("Account management needs Supabase.");
  try {
    return await assertStaff("super_admin");
  } catch {
    return fail("Only a Super Admin can manage accounts.");
  }
}
const isFail = (x: SessionUser | FormState): x is FormState => "at" in x || "error" in x;

function adminAuth() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}
const NO_SERVICE_KEY = "Server key missing: add SUPABASE_SERVICE_ROLE_KEY to the hosting environment variables.";

/** One-time password-setup link (no email needed: share it on WhatsApp). Valid for about an hour. */
async function setupLink(email: string): Promise<string | null> {
  const admin = adminAuth();
  if (!admin) return null;
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) return null;
  return `${publicEnv.siteUrl}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=recovery`;
}

async function categoryKind(categoryId: string | null): Promise<"staff" | "service" | null> {
  if (!categoryId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("staff_categories").select("kind").eq("id", categoryId).maybeSingle();
  return ((data as { kind?: string } | null)?.kind as "staff" | "service" | undefined) ?? null;
}

function categoryMismatch(role: AccountRole, kind: "staff" | "service" | null): string | null {
  if (role === "staff" && kind !== "staff") return "Choose a Staff category.";
  if (role === "service_staff" && kind !== "service") return "Choose a Service Staff category.";
  return null;
}

/** Makes `role` the user's only staff-type role (customer role is kept). */
async function setRole(userId: string, role: AccountRole, grantedBy: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: current } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const have = ((current ?? []) as { role: string }[]).map((r) => r.role);
  if (!have.includes(role)) {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role, granted_by: grantedBy });
    if (error) return dbMessage(error, "Couldn't set the role.");
  }
  const remove = have.filter((r) => r !== role && r !== "customer");
  if (remove.length) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).in("role", remove);
    if (error) return /primary Super Admin/i.test(error.message) ? "The primary Super Admin must stay Super Admin." : dbMessage(error, "Couldn't update roles.");
  }
  return null;
}

// ---------------------------------------------------------------- Create
const createSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the full name.").max(120),
    email: z.email("Enter a valid email.").max(254).transform((e) => e.toLowerCase()),
    phone: z.union([z.literal(""), z.string().regex(/^\+?[0-9 ]{7,20}$/, "Enter a valid phone number.")]),
    role: z.enum(ACCOUNT_ROLES, "Choose a role."),
    categoryId: z.union([z.literal(""), z.uuid()]),
    status: z.enum(["active", "inactive"]),
    access: z.enum(["password", "link"]),
    password: z.string().max(72),
    designation: z.string().trim().max(80),
    joiningDate: z.union([z.literal(""), z.iso.date("Use a valid date.")]),
  })
  .refine((v) => v.access === "link" || v.password.length >= 8, { path: ["password"], message: "Use at least 8 characters." });

export async function createAccountAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await superAdmin();
  if (isFail(me)) return me;
  const parsed = createSchema.safeParse({
    fullName: str(fd, "fullName"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    role: str(fd, "role"),
    categoryId: str(fd, "categoryId"),
    status: str(fd, "status") || "active",
    access: str(fd, "access") || "password",
    password: typeof fd.get("password") === "string" ? (fd.get("password") as string) : "",
    designation: str(fd, "designation"),
    joiningDate: str(fd, "joiningDate"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  const categoryId = v.categoryId || null;
  const mismatch = categoryMismatch(v.role, await categoryKind(categoryId));
  if (mismatch) return fail(mismatch, { categoryId: mismatch });

  const admin = adminAuth();
  if (!admin) return fail(NO_SERVICE_KEY);
  const supabase = await createClient();

  // Existing account with this email? Reuse it: no duplicate sign-ins.
  const { data: found } = await supabase.rpc("admin_list_accounts", { p_search: v.email, p_limit: 20 });
  const existing = ((found ?? []) as { id: string; email: string }[]).find((u) => u.email.toLowerCase() === v.email);

  let userId: string;
  let reused = false;
  if (existing) {
    userId = existing.id;
    reused = true;
  } else {
    const password = v.access === "password" ? v.password : randomBytes(24).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({
      email: v.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: v.fullName },
    });
    if (error || !data.user) {
      return fail(/password/i.test(error?.message ?? "") ? "That password is too weak. Use a longer one." : "Couldn't create the sign-in. Check the email and try again.");
    }
    userId = data.user.id;
  }

  // Name and phone (profiles are self-edit only under RLS, so this uses the server key).
  await admin.from("profiles").update({ full_name: v.fullName, phone: v.phone || null }).eq("id", userId);

  const roleError = await setRole(userId, v.role, me.id);
  if (roleError) return fail(roleError);

  const { error: profileError } = await supabase.from("staff_profiles").upsert(
    {
      user_id: userId,
      category_id: v.role === "staff" || v.role === "service_staff" ? categoryId : null,
      status: v.status,
      designation: v.designation || null,
      joining_date: v.joiningDate || null,
      created_by: me.id,
    },
    { onConflict: "user_id" },
  );
  if (profileError) return fail(dbMessage(profileError, "The sign-in was created, but the staff profile couldn't be saved. Open the account and save again."));

  await admin.auth.admin.updateUserById(userId, { ban_duration: v.status === "inactive" ? BAN_FOREVER : "none" });

  refresh();
  const link = v.access === "link" ? await setupLink(v.email) : null;
  const state = ok(
    reused
      ? "This email already had an account, so its role and staff profile were updated. They sign in with their existing password."
      : v.access === "link"
        ? link
          ? "Account created. Send the one-time setup link below to the staff member (it works once, for about an hour)."
          : "Account created, but the setup link couldn't be made. Open the account and use “Create setup link”."
        : "Account created. Share the email and password with the staff member privately.",
  );
  return { ...state, data: { userId, ...(link ? { link } : {}) } };
}

// ---------------------------------------------------------------- Update
const updateSchema = z.object({
  userId: z.uuid(),
  fullName: z.string().trim().min(2, "Enter the full name.").max(120),
  phone: z.union([z.literal(""), z.string().regex(/^\+?[0-9 ]{7,20}$/, "Enter a valid phone number.")]),
  role: z.enum(ACCOUNT_ROLES, "Choose a role."),
  categoryId: z.union([z.literal(""), z.uuid()]),
  designation: z.string().trim().max(80),
  joiningDate: z.union([z.literal(""), z.iso.date("Use a valid date.")]),
});

export async function updateAccountAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await superAdmin();
  if (isFail(me)) return me;
  const parsed = updateSchema.safeParse({
    userId: str(fd, "userId"),
    fullName: str(fd, "fullName"),
    phone: str(fd, "phone"),
    role: str(fd, "role"),
    categoryId: str(fd, "categoryId"),
    designation: str(fd, "designation"),
    joiningDate: str(fd, "joiningDate"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  if (v.userId === me.id && v.role !== "super_admin") return fail("You can't lower your own role.");
  const categoryId = v.role === "staff" || v.role === "service_staff" ? v.categoryId || null : null;
  const mismatch = categoryMismatch(v.role, await categoryKind(categoryId));
  if (mismatch) return fail(mismatch, { categoryId: mismatch });

  const admin = adminAuth();
  if (!admin) return fail(NO_SERVICE_KEY);
  if (v.role !== "super_admin") {
    const { data: target } = await admin.auth.admin.getUserById(v.userId);
    if (target.user?.email?.toLowerCase() === PRIMARY_EMAIL) return fail("The primary Super Admin must stay Super Admin.");
  }
  const supabase = await createClient();

  await admin.from("profiles").update({ full_name: v.fullName, phone: v.phone || null }).eq("id", v.userId);
  const roleError = await setRole(v.userId, v.role, me.id);
  if (roleError) return fail(roleError);
  const { error } = await supabase.from("staff_profiles").upsert(
    { user_id: v.userId, category_id: categoryId, designation: v.designation || null, joining_date: v.joiningDate || null },
    { onConflict: "user_id" },
  );
  if (error) return fail(dbMessage(error, "Couldn't save the account."));
  refresh();
  return ok("Account saved.");
}

// ---------------------------------------------------------------- Status / delete / setup link
const idSchema = z.object({ userId: z.uuid() });

export async function setAccountStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await superAdmin();
  if (isFail(me)) return me;
  const parsed = idSchema.safeParse({ userId: str(fd, "userId") });
  const status = str(fd, "status");
  if (!parsed.success || (status !== "active" && status !== "inactive")) return fail("Invalid request.");
  if (parsed.data.userId === me.id) return fail("You can't deactivate your own account.");
  const admin = adminAuth();
  if (!admin) return fail(NO_SERVICE_KEY);
  const supabase = await createClient();
  const { error } = await supabase.from("staff_profiles").upsert({ user_id: parsed.data.userId, status }, { onConflict: "user_id" });
  if (error) return fail(/primary Super Admin/i.test(error.message) ? "The primary Super Admin can't be deactivated." : dbMessage(error, "Couldn't change the status."));
  const { error: banError } = await admin.auth.admin.updateUserById(parsed.data.userId, { ban_duration: status === "inactive" ? BAN_FOREVER : "none" });
  refresh();
  if (banError) return ok(status === "inactive" ? "Access removed. (Sign-in block failed; their staff rights are already off.)" : "Reactivated.");
  return ok(status === "inactive" ? "Account deactivated. They can't sign in or use any staff page." : "Account reactivated.");
}

export async function deleteAccountAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await superAdmin();
  if (isFail(me)) return me;
  const parsed = idSchema.safeParse({ userId: str(fd, "userId") });
  if (!parsed.success) return fail("Invalid request.");
  if (parsed.data.userId === me.id) return fail("You can't delete your own account.");
  if (str(fd, "confirm").toUpperCase() !== "DELETE") return fail("Type DELETE to confirm.", { confirm: "Type DELETE to confirm." });
  const admin = adminAuth();
  if (!admin) return fail(NO_SERVICE_KEY);
  const { data: target } = await admin.auth.admin.getUserById(parsed.data.userId);
  if (target.user?.email?.toLowerCase() === PRIMARY_EMAIL) return fail("The primary Super Admin account can't be deleted.");
  const { error } = await admin.auth.admin.deleteUser(parsed.data.userId);
  if (error) return fail("Couldn't delete the account. Deactivate it instead.");
  refresh();
  return { ...ok("Account deleted."), data: { deleted: "1" } };
}

export async function createSetupLinkAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await superAdmin();
  if (isFail(me)) return me;
  const parsed = idSchema.safeParse({ userId: str(fd, "userId") });
  if (!parsed.success) return fail("Invalid request.");
  const admin = adminAuth();
  if (!admin) return fail(NO_SERVICE_KEY);
  const { data } = await admin.auth.admin.getUserById(parsed.data.userId);
  const email = data.user?.email;
  if (!email) return fail("This account has no email.");
  const link = await setupLink(email);
  if (!link) return fail("Couldn't create the link. Please try again.");
  return { ...ok("One-time link created. It sets a new password and works once, for about an hour."), data: { link } };
}

// ---------------------------------------------------------------- Permissions
function readMatrix(fd: FormData): Record<Module, Action[]> {
  const out = Object.fromEntries(MODULE_KEYS.map((m) => [m, [] as Action[]])) as Record<Module, Action[]>;
  for (const m of MODULE_KEYS) {
    for (const a of ACTIONS) if (fd.get(`perm:${m}:${a}`) === "on") out[m].push(a);
    // Any action implies view.
    if (out[m].length && !out[m].includes("view")) out[m].unshift("view");
  }
  return out;
}

export async function saveUserPermissionsAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await superAdmin();
  if (isFail(me)) return me;
  const parsed = idSchema.safeParse({ userId: str(fd, "userId") });
  if (!parsed.success) return fail("Invalid request.");
  const custom = str(fd, "mode") === "custom";
  const supabase = await createClient();
  const { error: flagError } = await supabase
    .from("staff_profiles")
    .upsert({ user_id: parsed.data.userId, custom_permissions: custom }, { onConflict: "user_id" });
  if (flagError) return fail(dbMessage(flagError, "Couldn't save permissions."));
  const { error: delError } = await supabase.from("user_permissions").delete().eq("user_id", parsed.data.userId);
  if (delError) return fail(dbMessage(delError, "Couldn't save permissions."));
  if (custom) {
    const rows = Object.entries(readMatrix(fd))
      .filter(([, a]) => a.length)
      .map(([module, actions]) => ({ user_id: parsed.data.userId, module, actions, updated_by: me.id }));
    if (rows.length) {
      const { error } = await supabase.from("user_permissions").insert(rows);
      if (error) return fail(dbMessage(error, "Couldn't save permissions."));
    }
  }
  refresh();
  return ok(custom ? "Custom permissions saved. They apply on the user's next page load." : "Now using the role's default permissions.");
}

const roleDefaultSchema = z.enum(["admin", "staff", "service_staff"]);

export async function saveRoleDefaultsAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await superAdmin();
  if (isFail(me)) return me;
  const role = roleDefaultSchema.safeParse(str(fd, "role"));
  if (!role.success) return fail("Choose a role.");
  const rows = Object.entries(readMatrix(fd)).map(([module, actions]) => ({ role: role.data, module, actions }));
  const supabase = await createClient();
  const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "role,module" });
  if (error) return fail(dbMessage(error, "Couldn't save the defaults."));
  refresh();
  return ok("Default permissions saved for everyone with this role (except custom accounts).");
}

// ---------------------------------------------------------------- Staff categories
const categorySchema = z.object({
  name: z.string().trim().min(2, "Use 2–60 characters.").max(60, "Use 2–60 characters."),
  kind: z.enum(["staff", "service"]),
});

export async function createStaffCategoryAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await superAdmin();
  if (isFail(me)) return me;
  const parsed = categorySchema.safeParse({ name: str(fd, "name"), kind: str(fd, "kind") });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.from("staff_categories").insert({ name: parsed.data.name, kind: parsed.data.kind, sort_order: 100 });
  if (error) return fail(error.code === "23505" ? "That category already exists." : dbMessage(error, "Couldn't add the category."));
  refresh();
  return ok(`Category “${parsed.data.name}” added.`);
}

export async function deleteStaffCategoryAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await superAdmin();
  if (isFail(me)) return me;
  const id = z.uuid().safeParse(str(fd, "id"));
  if (!id.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("staff_categories").delete().eq("id", id.data).eq("is_system", false).select("id");
  if (error) return fail(dbMessage(error, "Couldn't delete the category."));
  if (!data?.length) return fail("Built-in categories can't be deleted.");
  refresh();
  return ok("Category deleted. Staff in it keep their accounts (category cleared).");
}
