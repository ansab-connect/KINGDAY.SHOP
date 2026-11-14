import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "@/features/auth/actions";
import { safeNextPath } from "@/features/auth/session";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

async function RegisterForm({ searchParams }: { searchParams: PageProps<"/register">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined, "/account");
  return (
    <AuthForm
      action={signUp}
      submitLabel="Create account"
      hidden={{ next }}
      fields={[
        { name: "fullName", label: "Full name", type: "text", autoComplete: "name" },
        { name: "mobile", label: "Mobile number", type: "tel", autoComplete: "tel", inputMode: "tel", hint: "Used to sign in and to contact you about orders and service." },
        { name: "email", label: "Email (optional)", type: "email", autoComplete: "email", optional: true },
        { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
      ]}
    />
  );
}

export default function RegisterPage({ searchParams }: PageProps<"/register">) {
  return (
    <AuthCard
      title="Create your account"
      description="One KING DAY account for your orders, service bookings and wishlist."
      footer={<p>Already have an account? <Link href="/login" className="font-medium text-royal hover:underline">Sign in</Link></p>}
    >
      <Suspense fallback={<div className="h-80" />}>
        <RegisterForm searchParams={searchParams} />
      </Suspense>
      <p className="mt-5 text-xs text-muted-foreground">
        By creating an account you agree to our <Link href="/policies/terms" className="underline">Terms</Link> and{" "}
        <Link href="/policies/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </AuthCard>
  );
}
