import type { Metadata } from "next";
import { getCompany } from "@/features/company";
import { Suspense } from "react";
import { Mail, Settings } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { AccountShell } from "@/components/store/account/account-shell";
import { ComingSoon } from "@/components/store/coming-soon";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { supportMailto } from "@/config/storefront";
import { updatePassword } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Account Settings", robots: { index: false } };

async function SettingsContent() {
  const company = await getCompany();
  const user = await requireUser("/account/settings");
  return (
    <AccountShell active="/account/settings" title="Account settings">
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border p-5 sm:p-6">
          <h2 className="font-heading text-lg font-semibold text-deep">Change password</h2>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as {user.email}</p>
          <div className="mt-5">
            <AuthForm
              action={updatePassword}
              submitLabel="Update password"
              fields={[
                { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
                { name: "confirm", label: "Confirm new password", type: "password", autoComplete: "new-password" },
              ]}
            />
          </div>
        </section>
        <section className="rounded-2xl border p-5 sm:p-6">
          <h2 className="font-heading text-lg font-semibold text-deep">Need help?</h2>
          <p className="mt-1 text-sm text-muted-foreground">To change your email address or close your account, contact our support team.</p>
          <a href={supportMailto("Account help", company.email)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold text-deep hover:bg-muted">
            <Mail aria-hidden className="size-4" /> {company.email}
          </a>
        </section>
      </div>
    </AccountShell>
  );
}

export default function AccountSettingsPage() {
  if (!isSupabaseConfigured) {
    return <ComingSoon icon={Settings} title="Account settings" body="Account settings will be available once customer accounts are connected." />;
  }
  return (
    <Suspense fallback={<Container className="py-12"><Skeleton className="h-72 w-full rounded-2xl" /></Container>}>
      <SettingsContent />
    </Suspense>
  );
}
