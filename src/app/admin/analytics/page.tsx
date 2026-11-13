import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { ModulePlaceholder } from "@/components/admin/module-placeholder";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Analytics" description="Sales, product and customer performance" />
      <ModulePlaceholder
        icon={BarChart3}
        phase={10}
        summary="Analytics run on SQL aggregates over real orders once checkout and order processing are live."
        features={[
          "Daily, weekly and monthly sales",
          "Revenue and discount trends",
          "Product performance",
          "Category performance",
          "Order statistics and conversion",
          "Customer cohorts and repeat rate",
        ]}
      />
    </>
  );
}
