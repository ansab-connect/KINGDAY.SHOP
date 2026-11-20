"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatMobile, mobileLoginEmail, normalizeMobile } from "@/features/customer/mobile";
import { getCurrentUser, hasRole, homeFor, safeNextPath } from "./session";

export type AuthFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  values?: Record<string, string>;
};

const email = z.email("Enter a valid email address.").max(254).transform((v) => v.trim().toLowerCase());
const password = z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters.");

const NOT_CONFIGURED: AuthFormState = {
  error: "Sign-in isn't available yet. The store's account system is still being set up.",
};

function fieldErrors(error: z.ZodError): AuthFormState["fieldErrors"] {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

// Supabase error messages are mapped to neutral text so we never reveal
// whether an email address or mobile number is registered.
const GENERIC_LOGIN_ERROR = "Incorrect mobile number, email or password.";

/**
 * Resolves what the person typed (email or mobile number) to the sign-in email.
 * Mobile lookups run on the server with the service key; nothing is sent to the browser.
 */
async function loginEmailFor(login: string): Promise<string | null> {
  const value = login.trim().toLowerCase();
  if (value.includes("@")) return email.safeParse(value).success ? value : null;
  const mobile = normalizeMobile(value);
  if (!mobile) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("profiles").select("id").eq("mobile_e164", mobile).maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    if (!id) return null;
    const { data: u } = await admin.auth.admin.getUserById(id);
    return u.user?.email ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Sign in
const signInSchema = z.object({
  login: z.string().trim().min(3, "Enter your mobile number or email.").max(254),
  password: z.string().min(1, "Enter your password.").max(72),
});

async function passwordSignIn(formData: FormData): Promise<{ error?: AuthFormState; values: Record<string, string> }> {
  const values = { login: String(formData.get("login") ?? "") };
  const parsed = signInSchema.safeParse({ login: formData.get("login"), password: formData.get("password") });
  if (!parsed.success) return { error: { fieldErrors: fieldErrors(parsed.error), values }, values };
  const loginEmail = await loginEmailFor(parsed.data.login);
  if (!loginEmail) return { error: { error: GENERIC_LOGIN_ERROR, values }, values };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: parsed.data.password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: { error: "Please confirm your email address first. Check your inbox for the link.", values }, values };
    }
    return { error: { error: GENERIC_LOGIN_ERROR, values }, values };
  }
  return { values };
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const res = await passwordSignIn(formData);
  if (res.error) return res.error;
  redirect(safeNextPath(formData.get("next"), "/account"));
}

/** Admin sign-in: same credentials, but the account must hold a staff role. */
export async function signInAdmin(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const res = await passwordSignIn(formData);
  if (res.error) return res.error;
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "service_staff")) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return { error: "This account doesn't have staff access.", values: res.values };
  }
  redirect(homeFor(user));
}

// ---------------------------------------------------------------- Register
// No OTP yet (owner's choice): name + mobile + password create the account at once.
// One account per mobile number is enforced here and by a unique index.
const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
  mobile: z.string().trim().min(7, "Enter your mobile number.").max(20),
  email: z.union([z.literal(""), email]),
  password,
});

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const values = {
    fullName: String(formData.get("fullName") ?? ""),
    mobile: String(formData.get("mobile") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
  const parsed = signUpSchema.safeParse({ ...values, email: values.email.trim(), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (formData.get("confirm") !== null && formData.get("confirm") !== formData.get("password")) {
    return { fieldErrors: { confirm: "Passwords don't match." }, values };
  }
  const mobile = normalizeMobile(parsed.data.mobile);
  if (!mobile) return { fieldErrors: { mobile: "Enter a valid mobile number." }, values };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Registration is temporarily unavailable. Please try again later.", values };
  }
  const taken = await admin.from("profiles").select("id").eq("mobile_e164", mobile).maybeSingle();
  if (taken.data) {
    return { fieldErrors: { mobile: "This mobile number already has an account. Sign in instead." }, values };
  }

  const loginEmail = parsed.data.email || mobileLoginEmail(mobile);
  const { data: created, error } = await admin.auth.admin.createUser({
    email: loginEmail,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (error || !created.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) {
      return { fieldErrors: { email: "This email already has an account. Sign in instead." }, values };
    }
    if (/password/i.test(error?.message ?? "")) return { fieldErrors: { password: "Choose a stronger password." }, values };
    return { error: "We couldn't create your account. Please try again.", values };
  }

  const { error: phoneError } = await admin
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: formatMobile(mobile) })
    .eq("id", created.user.id);
  if (phoneError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { fieldErrors: { mobile: "This mobile number already has an account. Sign in instead." }, values };
  }

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: loginEmail, password: parsed.data.password });
  redirect(safeNextPath(formData.get("next"), "/account"));
}

// ---------------------------------------------------------------- Password reset
// Requests (with Super Admin approval) live in ./password-reset.ts. updatePassword below
// finishes the emailed-link flow used when System Settings → Password resets is "automatic".
const updatePasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match.", path: ["confirm"] });

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const parsed = updatePasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const user = await getCurrentUser();
  if (!user) return { error: "Your reset link has expired. Please request a new one." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return error.code === "same_password"
      ? { fieldErrors: { password: "Choose a password you haven't used before." } }
      : { error: "We couldn't update your password. Please try again." };
  }
  redirect("/account?password=updated");
}

// ---------------------------------------------------------------- Sign out
export async function signOut(formData: FormData) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect(safeNextPath(formData.get("next"), "/"));
}
