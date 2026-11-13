import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "@/features/auth/actions";
import { safeNextPath } from "@/features/auth/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

async function LoginForm({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined, "/account");
  const linkError = params.error === "link";
  return (
    <>
      {linkError ? (
        <p role="alert" className="mb-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          That link is invalid or has expired. Please sign in or request a new link.
        </p>
      ) : null}
      <AuthForm
        action={signIn}
        submitLabel="Sign in"
        hidden={{ next }}
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to track orders, save addresses and keep a wishlist."
      footer={
        <>
          <Link href="/forgot-password" className="font-medium text-royal hover:underline">Forgot your password?</Link>
          <p className="mt-3">
            New to KING DAY? <Link href="/register" className="font-medium text-royal hover:underline">Create an account</Link>
          </p>
        </>
      }
    >
      <Suspense fallback={<div className="h-64" />}>
        <LoginForm searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
