import type { Metadata } from "next";
import { Plus, Star } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { Pill, StockBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previewProducts } from "@/features/preview/data";
import { discountPercent, formatPaise } from "@/lib/format";
import { StaffOnly } from "@/components/admin/staff-only";

export const metadata: Metadata = { title: "Products" };

const statusTone = { active: "success", draft: "warning", archived: "neutral" } as const;

function ProductsPageContent() {
  return (
    <>
      <PageHeader
        title="Products"
        description={`${previewProducts.length} products · pricing, SKUs, variants and visibility`}
        actions={
          <Button disabled title="Product editor arrives in Phase 5">
            <Plus aria-hidden /> Add product
          </Button>
        }
      />
      <PreviewNotice phase={5} />
      <Card className="py-0 shadow-card">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Product</TableHead>
                <TableHead className="hidden lg:table-cell">Category</TableHead>
                <TableHead className="hidden text-right sm:table-cell">MRP</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="hidden text-right md:table-cell">Discount</TableHead>
                <TableHead className="hidden sm:table-cell">Stock</TableHead>
                <TableHead className="hidden xl:table-cell">Variants</TableHead>
                <TableHead className="pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewProducts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-royal-50 font-heading text-sm font-bold text-royal">
                        {p.name[0]}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-deep">
                          <span className="max-w-56 truncate">{p.name}</span>
                          {p.featured ? <Star aria-label="Featured" className="size-3.5 fill-gold text-gold" /> : null}
                        </p>
                        <p className="text-xs text-muted-foreground">{p.sku} · {p.brand}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{p.category}</TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular line-through sm:table-cell decoration-muted-foreground/40">{formatPaise(p.mrp)}</TableCell>
                  <TableCell className="text-right font-medium tabular">{formatPaise(p.price)}</TableCell>
                  <TableCell className="hidden text-right tabular md:table-cell">
                    <span className="font-medium text-gold-700">{discountPercent(p.mrp, p.price)}%</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell"><StockBadge stock={p.stock} reorderLevel={p.reorderLevel} /></TableCell>
                  <TableCell className="hidden tabular xl:table-cell">{p.variants}</TableCell>
                  <TableCell className="pr-6">
                    <Pill tone={statusTone[p.status]}>{p.status[0].toUpperCase() + p.status.slice(1)}</Pill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function ProductsPage() {
  return (
    <StaffOnly>
      <ProductsPageContent />
    </StaffOnly>
  );
}
