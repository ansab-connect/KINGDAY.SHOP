import type { Metadata } from "next";
import { BrandForm } from "@/components/admin/catalog/brand-form";
import { PreviewSaveNotice } from "@/components/admin/catalog/preview-save-notice";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";

export const metadata: Metadata = { title: "New brand" };

export default function NewBrandPage() {
  return (
    <StaffOnly module="brands">
      <PageHeader title="New brand" description="Add a brand to the catalogue" />
      <PreviewSaveNotice />
      <BrandForm brand={null} canDelete={false} />
    </StaffOnly>
  );
}
