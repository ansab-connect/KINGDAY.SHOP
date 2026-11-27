import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { QuickAccount } from "@/components/store/quick-account";
import { safeNextPath } from "@/features/auth/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

async function LoginForm({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined, "/launch");
  const linkError = params.error === "link";
  return (
    <>
      {linkError ? (
        <p role="alert" className="mb-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          That link is invalid or has expired. Please sign in or request a new link.
        </p>
      ) : null}
      <QuickAccount next={next} initialTab="returning" />
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard
      title="Sign in or create an account"
      description="Use your mobile number. New here? Tap New customer, it takes 20 seconds."
      footer={
        <p>Staff? <Link href="/admin/login" className="font-medium text-royal hover:underline">Staff sign-in</Link></p>
      }
    >
      <Suspense fallback={<div className="h-64" />}>
        <LoginForm searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
