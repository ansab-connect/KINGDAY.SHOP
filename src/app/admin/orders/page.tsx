import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { OrdersTable } from "@/components/admin/orders-table";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <>
      <PageHeader title="Orders" description="Track every order from placement to delivery" />
      <PreviewNotice phase={9} />
      <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-xl" />}>
        <OrdersTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}
