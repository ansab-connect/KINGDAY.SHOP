import { isGeminiConfigured } from "@/lib/gemini";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/admin/catalog/product-editor";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Pill } from "@/components/admin/status-badge";
import { can, getCurrentUser } from "@/features/auth/session";
import { getProductForEdit } from "@/features/catalog/admin-repo";
import { isSupabaseConfigured } from "@/lib/env";
import { loadEditorOptions } from "../editor-options";

export const metadata: Metadata = { title: "Edit product" };


async function EditProductContent({ params }: { params: PageProps<"/admin/products/[id]">["params"] }) {
  const { id } = await params;
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [product, options, user] = await Promise.all([getProductForEdit(id), loadEditorOptions(), getCurrentUser()]);
  if (!product) notFound();
  return (
    <>
      <PageHeader
        title={product.name}
        description={`${product.variants.length} variant${product.variants.length === 1 ? "" : "s"} · /products/${product.slug}`}
        actions={<Pill tone={product.status === "active" ? "success" : product.status === "draft" ? "warning" : "neutral"}>{product.status}</Pill>}
      />
      <ProductEditor product={product} categories={options.categories} brands={options.brands} optionTypes={options.optionTypes} canDelete={can(user, "products", "delete")} aiEnabled={isGeminiConfigured()} />
    </>
  );
}

export default function EditProductPage(props: PageProps<"/admin/products/[id]">) {
  return (
    <StaffOnly module="products">
      <EditProductContent params={props.params} />
    </StaffOnly>
  );
}
