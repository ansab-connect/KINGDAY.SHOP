import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { AuthForm } from "@/components/auth/auth-form";
import { signInAdmin } from "@/features/auth/actions";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: { absolute: "Admin sign in | KING DAY" }, robots: { index: false, follow: false } };

async function Notice({ searchParams }: { searchParams: PageProps<"/admin/login">["searchParams"] }) {
  const params = await searchParams;
  if (params.error !== "forbidden") return null;
  return (
    <p role="alert" className="mb-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
      Your account doesn&apos;t have access to the admin panel.
    </p>
  );
}

export default function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <main className="grid min-h-screen bg-deep lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="absolute -top-32 -left-32 size-[32rem] rounded-full bg-royal/50 blur-3xl" />
        <Logo tone="light" showTagline className="relative" />
        <p className="relative max-w-sm font-heading text-3xl leading-tight font-bold text-white">
          The control centre for <span className="text-gold">KING DAY</span>.
        </p>
        <p className="relative text-xs text-white/40">Authorised staff only. Access is logged.</p>
      </div>
      <div className="flex items-center justify-center bg-white p-6 lg:rounded-l-3xl">
        <div className="w-full max-w-sm">
          <Logo className="lg:hidden" />
          <h1 className="mt-8 text-2xl font-extrabold text-deep lg:mt-0">Admin sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use your staff account to continue.</p>
          <div className="mt-8">
            <Suspense fallback={null}>
              <Notice searchParams={searchParams} />
            </Suspense>
            {isSupabaseConfigured ? (
              <AuthForm
                action={signInAdmin}
                submitLabel="Sign in"
                fields={[
                  { name: "email", label: "Email", type: "email", autoComplete: "username" },
                  { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
                ]}
              />
            ) : (
              <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                Authentication is not configured yet. Add the Supabase keys to enable sign-in.
              </p>
            )}
          </div>
          <Link href="/" className="mt-10 inline-block text-sm text-muted-foreground hover:text-royal">← Back to store</Link>
        </div>
      </div>
    </main>
  );
}
