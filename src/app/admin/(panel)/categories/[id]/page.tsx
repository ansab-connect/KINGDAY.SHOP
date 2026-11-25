import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryForm } from "@/components/admin/catalog/category-form";
import { CategoryProducts, type CategoryProduct } from "@/components/admin/catalog/category-products";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { can, getCurrentUser } from "@/features/auth/session";
import { listCategories } from "@/features/catalog/admin-repo";
import { descendantIds, treeOrder } from "@/features/catalog/category-tree";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit category" };


async function EditCategoryContent({ params }: { params: PageProps<"/admin/categories/[id]">["params"] }) {
  const { id } = await params;
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [all, user] = await Promise.all([listCategories(), getCurrentUser()]);
  const category = all.find((c) => c.id === id);
  if (!category) notFound();
  const tree = all.map((c) => ({ id: c.id, parentId: c.parent_id, name: c.name }));
  const inside = descendantIds(tree, id);

  // Products here: main category = this one, or added here as an extra category.
  const supabase = await createClient();
  const [{ data: products }, { data: extra }] = await Promise.all([
    supabase.from("products").select("id, name, status, category_id").neq("status", "archived").order("name").limit(3000),
    supabase.from("product_categories").select("product_id").eq("category_id", id),
  ]);
  const catName = new Map(all.map((c) => [c.id, c.name]));
  const extraIds = new Set(((extra ?? []) as { product_id: string }[]).map((r) => r.product_id));
  const allProducts: CategoryProduct[] = ((products ?? []) as { id: string; name: string; status: string; category_id: string | null }[]).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    main: p.category_id === id,
    mainCategory: (p.category_id && catName.get(p.category_id)) || "—",
  }));
  const assigned = allProducts.filter((p) => p.main || extraIds.has(p.id));
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
      <CategoryProducts categoryId={id} assigned={assigned} all={allProducts} canEdit={can(user, "products", "edit")} />
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
