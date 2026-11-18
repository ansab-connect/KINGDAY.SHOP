import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BulkImport } from "@/components/admin/catalog/bulk-import";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { can, getCurrentUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { loadEditorOptions } from "../editor-options";

export const metadata: Metadata = { title: "Import products" };

async function ImportContent() {
  const me = await getCurrentUser();
  if (isSupabaseConfigured && !can(me, "products", "create")) {
    return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">You need permission to create products to use bulk import.</p>;
  }
  const { categories, brands } = await loadEditorOptions();
  return (
    <>
      <Link href="/admin/products" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Products
      </Link>
      <PageHeader
        title="Import products"
        description="Add many products from an Excel file. Every row is checked and shown for review; nothing is saved until you click Import."
      />
      <BulkImport categories={categories.map((c) => ({ id: c.id, name: c.name }))} brands={brands} />
    </>
  );
}

export default function ImportProductsPage() {
  return (
    <StaffOnly module="products">
      <ImportContent />
    </StaffOnly>
  );
}
