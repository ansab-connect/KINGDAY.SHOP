"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
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
// whether an email address is registered.
const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

// ---------------------------------------------------------------- Sign in
const signInSchema = z.object({ email, password: z.string().min(1, "Enter your password.").max(72) });

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email address first. Check your inbox for the link.", values };
    }
    return { error: GENERIC_LOGIN_ERROR, values };
  }
  redirect(safeNextPath(formData.get("next"), "/account"));
}

/** Admin sign-in: same credentials, but the account must hold a staff role. */
export async function signInAdmin(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: GENERIC_LOGIN_ERROR, values };

  const user = await getCurrentUser();
  if (!user || !hasRole(user, "service_staff")) {
    await supabase.auth.signOut();
    return { error: "This account doesn't have staff access.", values };
  }
  redirect(homeFor(user));
}

// ---------------------------------------------------------------- Register
const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
  email,
  password,
});

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const values = { fullName: String(formData.get("fullName") ?? ""), email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/account`,
    },
  });
  if (error && error.code === "weak_password") {
    return { fieldErrors: { password: "Choose a stronger password." }, values };
  }
  if (error && error.status !== 422) {
    return { error: "We couldn't create your account. Please try again.", values };
  }
  // Same response whether or not the email already exists (no account enumeration).
  return { message: "Check your email for a link to confirm your account." };
}

// ---------------------------------------------------------------- Password reset
export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const parsed = z.object({ email }).safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: { email: String(formData.get("email") ?? "") } };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/reset-password`,
  });
  return { message: "If an account exists for that email, we've sent a link to reset your password." };
}

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
