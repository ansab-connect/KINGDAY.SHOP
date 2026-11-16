"use server";

import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/features/auth/session";
import { normalizeMobile } from "@/features/customer/mobile";
import { fail, ok, type FormState } from "@/features/forms";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AuthFormState } from "./actions";

/**
 * Forgot password with Super Admin approval (Update 01, Phase 07).
 *
 * The proposed password is hashed here (bcrypt) and only the hash is stored, in a table
 * nobody can read through the API. The old password keeps working until a reviewer
 * approves; then the hash is applied with the Auth admin API and all sessions end.
 */

const GENERIC_SENT =
  "If this is a registered account, your request has been sent to our team. We will call your registered mobile number to confirm it is you. Your current password keeps working until the request is approved.";

const requestSchema = z
  .object({
    login: z.string().trim().min(3, "Enter your registered mobile number or email.").max(254),
    password: z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match.", path: ["confirm"] })
  .refine((v) => Buffer.byteLength(v.password, "utf8") <= 72, { message: "That password is too long.", path: ["password"] });

export async function requestPasswordResetApproval(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return { error: "Password reset isn't available yet." };
  const values = { login: String(formData.get("login") ?? "") };
  const parsed = requestSchema.safeParse({ login: formData.get("login"), password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { fieldErrors, values };
  }
  const { login, password } = parsed.data;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Password reset isn't available right now. Please contact us on WhatsApp." };
  }

  const isEmail = login.includes("@");
  let userId: string | null = null;
  let contact = login.trim().toLowerCase();
  if (isEmail) {
    if (!z.email().safeParse(contact).success) return { fieldErrors: { login: "Enter a valid email address." }, values };
    const { data } = await admin.rpc("find_user_by_email", { p_email: contact });
    userId = typeof data === "string" ? data : null;
  } else {
    const mobile = normalizeMobile(login);
    if (!mobile) return { fieldErrors: { login: "Enter a valid mobile number." }, values };
    contact = mobile;
    const { data } = await admin.from("profiles").select("id").eq("mobile_e164", mobile).maybeSingle();
    userId = (data as { id?: string } | null)?.id ?? null;
  }

  // Automatic mode (System Settings): accounts with a real email verify ownership with the emailed link instead.
  const { data: mode } = await admin.from("store_settings").select("value").eq("key", "system.password_reset_mode").maybeSingle();
  if ((mode as { value?: unknown } | null)?.value === "automatic" && isEmail && !contact.endsWith("@customers.kingday.in")) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(contact, { redirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/reset-password` });
    return { message: "If an account exists for that email, we've sent a link to set your new password." };
  }

  // Same answer and similar timing whether or not the account exists (no account discovery).
  const hash = await bcrypt.hash(password, 12);
  if (!userId) return { message: GENERIC_SENT };
  const { error } = await admin.rpc("create_password_reset_request", { p_user: userId, p_kind: isEmail ? "email" : "mobile", p_contact: contact, p_hash: hash });
  if (error && /rate_limited/.test(error.message)) {
    return { error: "Too many reset requests for this account today. Please contact us on WhatsApp." };
  }
  return { message: GENERIC_SENT };
}

// ---------------------------------------------------------------- Reviewer (Super Admin, or Admin with permission)

export async function reviewPasswordResetAction(_: FormState, fd: FormData): Promise<FormState> {
  if (!isSupabaseConfigured) return fail("Needs Supabase.");
  try {
    await assertStaff("staff");
  } catch {
    return fail("You don't have permission to do that.");
  }
  const parsed = z
    .object({ id: z.uuid(), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500) })
    .safeParse({ id: fd.get("id"), decision: fd.get("decision"), note: String(fd.get("note") ?? "") });
  if (!parsed.success) return fail("Invalid request.");
  const { id, decision, note } = parsed.data;

  // The database checks the reviewer's permission and the request's state.
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_password_reset", { p_id: id, p_approve: decision === "approve", p_note: note || null });
  if (error) {
    if (error.code === "42501") return fail(/own request/.test(error.message) ? "You can't review your own request." : "You don't have permission to do that.");
    return fail(/already/.test(error.message) ? error.message : "Couldn't save the decision. Please refresh.");
  }
  if (decision === "reject") {
    refresh();
    return ok("Rejected. The old password still works and the person has been told.");
  }

  // Apply the approved hash with the Auth admin API, then end all their sessions.
  const admin = createAdminClient();
  const { data: rowsData } = await admin.rpc("take_password_reset_hash", { p_id: id });
  const row = (Array.isArray(rowsData) ? rowsData[0] : rowsData) as { user_id: string; password_hash: string } | undefined;
  if (!row) {
    refresh();
    return fail("This request has expired. Ask the person to send a new one.");
  }
  const { error: authError } = await admin.auth.admin.updateUserById(row.user_id, { password_hash: row.password_hash });
  await admin.rpc("complete_password_reset", { p_id: id, p_ok: !authError, p_error: authError ? authError.message.slice(0, 200) : null });
  refresh();
  if (authError) {
    return fail("Approved, but the new password couldn't be applied. Try Approve again, or send them a password setup link from Users & Roles.");
  }
  return ok("Approved. The new password is active and they've been signed out everywhere.");
}
