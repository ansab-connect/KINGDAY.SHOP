import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { StaffOnly } from "@/components/admin/staff-only";
import { Pill } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { listBrands } from "@/features/catalog/admin-repo";
import { previewBrands } from "@/features/preview/data";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Brands" };

type Row = { id: string; name: string; productCount: number; active: boolean; logoUrl: string | null; href: string | null };

async function BrandsContent() {
  const rows: Row[] = isSupabaseConfigured
    ? (await listBrands()).map((b) => ({ id: b.id, name: b.name, productCount: b.product_count, active: b.is_active, logoUrl: b.logo_url, href: `/admin/brands/${b.id}` }))
    : previewBrands.map((b) => ({ id: b.id, name: b.name, productCount: b.productCount, active: b.active, logoUrl: null, href: null }));

  return (
    <>
      <PageHeader
        title="Brands"
        description="Brand logos, descriptions and brand-wise listings"
        actions={
          <Button asChild>
            <Link href="/admin/brands/new"><Plus aria-hidden /> Add brand</Link>
          </Button>
        }
      />
      {!isSupabaseConfigured ? <PreviewNotice /> : null}
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">No brands yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => {
            const inner = (
              <>
                <span aria-hidden className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted/50 font-heading text-lg font-bold text-royal">
                  {b.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                    <img src={b.logoUrl} alt="" className="size-full object-contain p-1" />
                  ) : (
                    b.name.split(" ").map((w) => w[0]).join("").slice(0, 2)
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading font-semibold text-deep">{b.name}</p>
                  <p className="text-sm text-muted-foreground">{b.productCount} products</p>
                </div>
                {b.active ? <Pill tone="success">Active</Pill> : <Pill tone="neutral">Hidden</Pill>}
              </>
            );
            return (
              <li key={b.id}>
                {b.href ? (
                  <Link href={b.href} className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-card transition-shadow hover:shadow-lift">{inner}</Link>
                ) : (
                  <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-card">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function BrandsPage() {
  return (
    <StaffOnly module="brands">
      <BrandsContent />
    </StaffOnly>
  );
}
