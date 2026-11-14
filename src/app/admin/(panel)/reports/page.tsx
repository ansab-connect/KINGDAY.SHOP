import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { ModulePlaceholder } from "@/components/admin/module-placeholder";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";

export const metadata: Metadata = { title: "Reports" };

function ReportsPageContent() {
  return (
    <>
      <PageHeader title="Reports" description="Exportable business reports" />
      <ModulePlaceholder
        icon={FileText}
        phase={10}
        summary="Downloadable reports for accounting and operations. Purchase, POS and wholesale reports join as those modules are added."
        features={[
          "Sales register (CSV)",
          "GST / tax summary",
          "Stock valuation",
          "Stock movement ledger",
          "Coupon & discount usage",
          "Payments & COD reconciliation",
        ]}
      />
    </>
  );
}

export default function ReportsPage() {
  return (
    <StaffOnly module="reports">
      <ReportsPageContent />
    </StaffOnly>
  );
}
