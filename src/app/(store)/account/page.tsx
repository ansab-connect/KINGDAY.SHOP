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
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "My Account", robots: { index: false } };

async function AccountContent({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const user = await requireUser("/account");
  const [params, profile] = await Promise.all([searchParams, getProfile(user.id)]);
  return (
    <AccountShell active="/account" title={`Hello, ${profile?.full_name ?? user.fullName ?? "there"}`}>
      {params.password === "updated" ? (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 aria-hidden className="size-4" /> Your password has been updated.
        </p>
      ) : null}
      <section className="rounded-2xl border p-5 sm:p-6">
        <h2 className="font-heading text-lg font-semibold text-deep">Profile</h2>
        <div className="mt-4">
          <ProfileForm profile={profile} email={user.email} />
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
