import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryForm } from "@/components/admin/catalog/category-form";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { can, getCurrentUser } from "@/features/auth/session";
import { listCategories } from "@/features/catalog/admin-repo";
import { descendantIds, treeOrder } from "@/features/catalog/category-tree";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Edit category" };


async function EditCategoryContent({ params }: { params: PageProps<"/admin/categories/[id]">["params"] }) {
  const { id } = await params;
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [all, user] = await Promise.all([listCategories(), getCurrentUser()]);
  const category = all.find((c) => c.id === id);
  if (!category) notFound();
  const tree = all.map((c) => ({ id: c.id, parentId: c.parent_id, name: c.name }));
  const inside = descendantIds(tree, id);
  return (
    <>
      <PageHeader title={category.name} description={`Edit category · ${category.product_count} products`} />
      <CategoryForm
        category={category}
        // Any category can be the parent, except this one and the ones inside it (no loops).
        parents={treeOrder(tree)
          .filter((c) => c.id !== id && !inside.has(c.id))
          .map((c) => ({ id: c.id, name: `${"— ".repeat(c.depth)}${c.name}` }))}
        canDelete={can(user, "categories", "delete")}
      />
    </>
  );
}

export default function EditCategoryPage(props: PageProps<"/admin/categories/[id]">) {
  return (
    <StaffOnly module="categories">
      <EditCategoryContent params={props.params} />
    </StaffOnly>
  );
}
