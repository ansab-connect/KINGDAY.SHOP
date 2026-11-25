import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { PurchaseForm } from "@/components/admin/purchases/purchase-form";
import { StaffOnly } from "@/components/admin/staff-only";
import { getSuppliers, getVariantOptions } from "@/features/purchases/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { isGeminiConfigured } from "@/lib/gemini";

export const metadata: Metadata = { title: "New purchase" };

async function NewPurchase() {
  const [variants, suppliers] = isSupabaseConfigured ? await Promise.all([getVariantOptions(), getSuppliers()]) : [[], []];
  return (
    <>
      <Link href="/admin/purchases" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-royal">
        <ArrowLeft aria-hidden className="size-4" /> All purchases
      </Link>
      <PageHeader title="New purchase" description="Import the supplier bill with a photo, or type it in. Check the items, then save to add the stock." />
      {!isSupabaseConfigured ? <PreviewNotice /> : null}
      <PurchaseForm variants={variants} suppliers={suppliers} aiEnabled={isGeminiConfigured()} />
    </>
  );
}

export default function NewPurchasePage() {
  return (
    <StaffOnly module="purchases">
      <NewPurchase />
    </StaffOnly>
  );
}
