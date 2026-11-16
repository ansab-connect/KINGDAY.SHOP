import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { PayslipView } from "@/components/staff/payslip-view";
import { PrintButton } from "@/components/staff/work-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { requireTeam } from "@/features/auth/session";
import { getPayslip } from "@/features/staff/work";

export const metadata: Metadata = { title: "Payslip" };

async function Slip({ params }: PageProps<"/staff/salary/[id]">) {
  const user = await requireTeam();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const slip = await getPayslip(id);
  // RLS already hides other people's payslips; the portal shows only your own.
  if (!slip || slip.user_id !== user.id) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/staff/salary" className="inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline">
          <ArrowLeft aria-hidden className="size-4" /> <L en="My salary" ml="എന്റെ ശമ്പളം" />
        </Link>
        <PrintButton />
      </div>
      <PayslipView slip={slip} />
    </div>
  );
}

export default function PayslipPage(props: PageProps<"/staff/salary/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <Slip {...props} />
    </Suspense>
  );
}
