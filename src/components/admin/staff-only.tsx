import { Suspense } from "react";
import { ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { requireStaff, type StaffRole } from "@/features/auth/session";

/**
 * Page-level authorisation for the admin panel.
 *
 * Next.js renders layouts and pages independently, so the check in the admin
 * layout alone would NOT stop a page's content from being rendered and sent.
 * Every admin page therefore wraps its content in <StaffOnly>; the content is
 * only rendered after the role check passes.
 */
export function StaffOnly({ children, minimum = "staff" }: { children: React.ReactNode; minimum?: StaffRole }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Gate minimum={minimum}>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children, minimum }: { children: React.ReactNode; minimum: StaffRole }) {
  const access = await requireStaff(minimum);
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
