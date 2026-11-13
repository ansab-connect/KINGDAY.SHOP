import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandForm } from "@/components/admin/catalog/brand-form";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { getCurrentUser, hasRole } from "@/features/auth/session";
import { getBrand } from "@/features/catalog/admin-repo";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Edit brand" };


async function EditBrandContent({ params }: { params: PageProps<"/admin/brands/[id]">["params"] }) {
  const { id } = await params;
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [brand, user] = await Promise.all([getBrand(id), getCurrentUser()]);
  if (!brand) notFound();
  return (
    <>
      <PageHeader title={brand.name} description={`Edit brand · ${brand.product_count} products`} />
      <BrandForm brand={brand} canDelete={hasRole(user, "admin")} />
    </>
  );
}

export default function EditBrandPage(props: PageProps<"/admin/brands/[id]">) {
  return (
    <StaffOnly>
      <EditBrandContent params={props.params} />
    </StaffOnly>
  );
}
