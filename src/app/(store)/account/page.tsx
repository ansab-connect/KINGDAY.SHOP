import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2, LogOut, User } from "lucide-react";
import { AccountShell } from "@/components/store/account/account-shell";
import { ProfileForm } from "@/components/store/account/account-forms";
import { ComingSoon } from "@/components/store/coming-soon";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { getProfile } from "@/features/account/queries";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/session";
import { isMobileLoginEmail } from "@/features/customer/mobile";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Account", robots: { index: false } };

async function AccountContent({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const user = await requireUser("/account");
  const supabase = await createClient();
  const [params, profile, codeRow, orders, services] = await Promise.all([
    searchParams,
    getProfile(user.id),
    supabase.from("profiles").select("customer_code").eq("id", user.id).maybeSingle(),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("service_bookings").select("id", { count: "exact", head: true }).eq("customer_id", user.id),
  ]);
  const summary = {
    code: (codeRow.data as { customer_code?: string } | null)?.customer_code ?? null,
    orders: orders.count ?? 0,
    services: services.count ?? 0,
  };
  return (
    <AccountShell active="/account" title={`Hello, ${profile?.full_name ?? user.fullName ?? "there"}`}>
      {params.password === "updated" ? (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 aria-hidden className="size-4" /> Your password has been updated.
        </p>
      ) : null}
      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-deep p-5 text-white sm:col-span-1">
          <p className="text-xs font-semibold tracking-[0.18em] text-gold uppercase">Customer ID</p>
          <p className="mt-2 font-mono text-xl font-bold">{summary.code ?? "—"}</p>
          <p className="mt-1 text-xs text-white/60">Quote this when you call or WhatsApp us.</p>
        </div>
        <a href="/account/orders" className="rounded-2xl border bg-white p-5 hover:shadow-card">
          <p className="text-xs text-muted-foreground">Product orders</p>
          <p className="mt-2 font-heading text-2xl font-bold text-deep tabular">{summary.orders}</p>
        </a>
        <a href="/account/service" className="rounded-2xl border bg-white p-5 hover:shadow-card">
          <p className="text-xs text-muted-foreground">Service bookings</p>
          <p className="mt-2 font-heading text-2xl font-bold text-deep tabular">{summary.services}</p>
        </a>
      </section>
      <section className="rounded-2xl border p-5 sm:p-6">
        <h2 className="font-heading text-lg font-semibold text-deep">Profile</h2>
        <div className="mt-4">
          <ProfileForm profile={profile} email={isMobileLoginEmail(user.email) ? null : user.email} />
        </div>
      </section>
      <form action={signOut} className="mt-6">
        <input type="hidden" name="next" value="/" />
        <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold text-deep hover:bg-muted">
          <LogOut aria-hidden className="size-4" /> Sign out
        </button>
      </form>
    </AccountShell>
  );
}

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  if (!isSupabaseConfigured) {
    return <ComingSoon icon={User} title="My account" body="Customer accounts will be available once the store's account system is connected." />;
  }
  return (
    <Suspense fallback={<Container className="py-12"><Skeleton className="h-72 w-full rounded-2xl" /></Container>}>
      <AccountContent searchParams={searchParams} />
    </Suspense>
  );
}
