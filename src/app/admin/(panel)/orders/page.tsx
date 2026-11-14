import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { OrdersTable } from "@/components/admin/orders-table";
import { Skeleton } from "@/components/ui/skeleton";
import { StaffOnly } from "@/components/admin/staff-only";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Orders" };

function OrdersPageContent({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <>
      <PageHeader title="Orders" description="Track every order from placement to delivery. Search by order number, name, phone, email or city." />
      {isSupabaseConfigured ? null : <PreviewNotice phase={9} />}
      <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-xl" />}>
        <OrdersTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

export default function OrdersPage(props: PageProps<"/admin/orders">) {
  return (
    <StaffOnly module="orders">
      <OrdersPageContent {...props} />
    </StaffOnly>
  );
}
