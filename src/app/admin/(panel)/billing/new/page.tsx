import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BillForm } from "@/components/admin/billing/bill-form";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { can, getCurrentUser } from "@/features/auth/session";

export const metadata: Metadata = { title: "New bill" };

async function NewBill({ searchParams }: { searchParams: PageProps<"/admin/billing/new">["searchParams"] }) {
  const params = await searchParams;
  const me = await getCurrentUser();
  const allowSale = can(me, "orders", "create") || can(me, "orders", "edit");
  const allowService = can(me, "billing", "create") || can(me, "service", "edit");
  const kind = params.type === "service" || !allowSale ? "service" : "sale";

  return (
    <>
      <Link href="/admin/billing" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-royal">
        <ArrowLeft aria-hidden className="size-4" /> All bills
      </Link>
      <PageHeader title="New bill" description="Choose Sale or Service, add the customer and items, then save to print." />
      {allowSale || allowService ? (
        <BillForm initialKind={kind} allowSale={allowSale} allowService={allowService} />
      ) : (
        <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">You don&apos;t have permission to make bills. Ask a Super Admin.</p>
      )}
    </>
  );
}

export default function NewBillPage(props: PageProps<"/admin/billing/new">) {
  return (
    <StaffOnly module="orders">
      <NewBill searchParams={props.searchParams} />
    </StaffOnly>
  );
}
