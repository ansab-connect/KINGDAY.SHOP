import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryForm } from "@/components/admin/catalog/category-form";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { getCurrentUser, hasRole } from "@/features/auth/session";
import { listCategories } from "@/features/catalog/admin-repo";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Edit category" };


async function EditCategoryContent({ params }: { params: PageProps<"/admin/categories/[id]">["params"] }) {
  const { id } = await params;
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [all, user] = await Promise.all([listCategories(), getCurrentUser()]);
  const category = all.find((c) => c.id === id);
  if (!category) notFound();
  const hasChildren = all.some((c) => c.parent_id === id);
  return (
    <>
      <PageHeader title={category.name} description={`Edit category · ${category.product_count} products`} />
      <CategoryForm
        category={category}
        // Only top-level categories can be parents, and a parent can't become a child.
        parents={hasChildren ? [] : all.filter((c) => !c.parent_id && c.id !== id).map((c) => ({ id: c.id, name: c.name }))}
        canDelete={hasRole(user, "admin")}
      />
    </>
  );
}

export default function EditCategoryPage(props: PageProps<"/admin/categories/[id]">) {
  return (
    <StaffOnly>
      <EditCategoryContent params={props.params} />
    </StaffOnly>
  );
}
