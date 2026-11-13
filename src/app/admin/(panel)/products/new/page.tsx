import type { Metadata } from "next";
import { PreviewSaveNotice } from "@/components/admin/catalog/preview-save-notice";
import { ProductEditor } from "@/components/admin/catalog/product-editor";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { loadEditorOptions } from "../editor-options";

export const metadata: Metadata = { title: "New product" };

async function NewProductContent() {
  const { categories, brands } = await loadEditorOptions();
  return (
    <>
      <PageHeader title="New product" description="Add a product with its variants, pricing and specifications" />
      <PreviewSaveNotice />
      <ProductEditor product={null} categories={categories} brands={brands} canDelete={false} />
    </>
  );
}

export default function NewProductPage() {
  return (
    <StaffOnly>
      <NewProductContent />
    </StaffOnly>
  );
}
