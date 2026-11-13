import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { Pill } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { previewBrands } from "@/features/preview/data";

export const metadata: Metadata = { title: "Brands" };

export default function BrandsPage() {
  return (
    <>
      <PageHeader
        title="Brands"
        description="Brand logos, descriptions and brand-wise listings"
        actions={<Button disabled><Plus aria-hidden /> Add brand</Button>}
      />
      <PreviewNotice phase={5} />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {previewBrands.map((b) => (
          <li key={b.id}>
            <Card className="gap-0 py-0 shadow-card transition-shadow duration-300 hover:shadow-lift">
              <CardContent className="flex items-center gap-4 p-5">
                <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-xl border bg-muted/50 font-heading text-lg font-bold text-royal">
                  {b.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading font-semibold text-deep">{b.name}</p>
                  <p className="text-sm text-muted-foreground">{b.productCount} products</p>
                </div>
                {b.active ? <Pill tone="success">Active</Pill> : <Pill tone="neutral">Hidden</Pill>}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
