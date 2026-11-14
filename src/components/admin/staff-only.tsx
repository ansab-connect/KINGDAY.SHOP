import { Suspense } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Module } from "@/features/auth/permissions";
import { requireStaff, type StaffRole } from "@/features/auth/session";

/**
 * Page-level authorisation for the admin panel.
 *
 * Next.js renders layouts and pages independently, so the check in the admin
 * layout alone would NOT stop a page's content from being rendered and sent.
 * Every admin page therefore wraps its content in <StaffOnly>; the content is
 * only rendered after the role check passes.
 */
export function StaffOnly({ children, minimum = "staff", module }: { children: React.ReactNode; minimum?: StaffRole; module?: Module }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Gate minimum={minimum} module={module}>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children, minimum, module }: { children: React.ReactNode; minimum: StaffRole; module?: Module }) {
  const access = await requireStaff(minimum, module);
  if (access.status === "denied") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border bg-white p-8 text-center shadow-card">
        <Lock aria-hidden className="mx-auto size-8 text-royal" />
        <p className="mt-3 font-heading font-semibold text-deep">You don&apos;t have access to this page</p>
        <p className="mt-1 text-sm text-muted-foreground">Ask a Super Admin to give you permission.</p>
      </div>
    );
  }
  if (access.status === "unconfigured") {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center">
        <ShieldAlert aria-hidden className="mx-auto size-8 text-danger" />
        <p className="mt-3 font-semibold text-deep">Access denied</p>
      </div>
    );
  }
  return <>{children}</>;
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="mt-4 h-72 w-full rounded-xl" />
    </div>
  );
}
