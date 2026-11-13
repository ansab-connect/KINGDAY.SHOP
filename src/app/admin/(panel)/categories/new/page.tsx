import type { Metadata } from "next";
import { CategoryForm } from "@/components/admin/catalog/category-form";
import { PreviewSaveNotice } from "@/components/admin/catalog/preview-save-notice";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { listCategories } from "@/features/catalog/admin-repo";
import { previewCategories } from "@/features/preview/data";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "New category" };

async function NewCategoryContent() {
  const parents = isSupabaseConfigured
    ? (await listCategories()).filter((c) => !c.parent_id).map((c) => ({ id: c.id, name: c.name }))
    : previewCategories.filter((c) => !c.parent).map((c) => ({ id: c.id, name: c.name }));
  return (
    <>
      <PageHeader title="New category" description="Create a category or subcategory" />
      <PreviewSaveNotice />
      <CategoryForm category={null} parents={parents} canDelete={false} />
    </>
  );
}

export default function NewCategoryPage() {
  return (
    <StaffOnly>
      <NewCategoryContent />
    </StaffOnly>
  );
}
