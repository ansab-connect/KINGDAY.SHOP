import type { Metadata } from "next";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { StatCard } from "@/components/admin/stat-card";
import { Pill, StockBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previewProducts, previewStockMovements, type StockMovementType } from "@/features/preview/data";
import { formatDateTime, formatNumber, formatPaise } from "@/lib/format";

export const metadata: Metadata = { title: "Inventory" };

const movementLabel: Record<StockMovementType, { label: string; tone: "success" | "info" | "warning" | "neutral" | "royal" }> = {
  opening: { label: "Opening", tone: "neutral" },
  stock_in: { label: "Stock in", tone: "success" },
  stock_out: { label: "Stock out", tone: "warning" },
  adjustment: { label: "Adjustment", tone: "warning" },
  sale: { label: "Sale", tone: "royal" },
  return: { label: "Return", tone: "info" },
};

export default function InventoryPage() {
  const units = previewProducts.reduce((s, p) => s + p.stock, 0);
  const value = previewProducts.reduce((s, p) => s + p.stock * p.price, 0);
  const low = previewProducts.filter((p) => p.stock > 0 && p.stock <= p.reorderLevel).length;
  const out = previewProducts.filter((p) => p.stock === 0).length;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="SKU-wise stock, movements and adjustments"
        actions={
          <>
            <Button variant="outline" disabled><SlidersHorizontal aria-hidden /> Adjust stock</Button>
            <Button disabled><ArrowDownToLine aria-hidden /> Stock in</Button>
          </>
        }
      />
      <PreviewNotice phase={6} />
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Units in stock" value={formatNumber(units)} icon={Boxes} tone="royal" />
        <StatCard label="Stock value (selling)" value={formatPaise(value)} icon={ArrowUpFromLine} tone="gold" />
        <StatCard label="Low stock SKUs" value={formatNumber(low)} icon={AlertTriangle} tone="warning" />
        <StatCard label="Out of stock SKUs" value={formatNumber(out)} icon={AlertTriangle} tone="neutral" />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="shadow-card xl:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-base">Stock by SKU</CardTitle>
            <CardDescription>Reorder level: 5 units</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">SKU</TableHead>
                  <TableHead className="pr-6 text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...previewProducts].sort((a, b) => a.stock - b.stock).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-6">
                      <p className="max-w-60 truncate font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku}</p>
                    </TableCell>
                    <TableCell className="pr-6 text-right"><StockBadge stock={p.stock} reorderLevel={p.reorderLevel} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card xl:col-span-3">
          <CardHeader>
            <CardTitle className="font-heading text-base">Stock movements</CardTitle>
            <CardDescription>Every stock change is recorded with a reason and user</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">When</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Balance</TableHead>
                  <TableHead className="hidden pr-6 lg:table-cell">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewStockMovements.slice(0, 16).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="pl-6 text-xs text-muted-foreground">{formatDateTime(m.at)}</TableCell>
                    <TableCell className="text-xs font-medium">{m.sku}</TableCell>
                    <TableCell><Pill tone={movementLabel[m.type].tone}>{movementLabel[m.type].label}</Pill></TableCell>
                    <TableCell className={`text-right font-medium tabular ${m.quantity < 0 ? "text-danger" : "text-success"}`}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </TableCell>
                    <TableCell className="hidden text-right tabular md:table-cell">{m.balance}</TableCell>
                    <TableCell className="hidden pr-6 text-xs text-muted-foreground lg:table-cell">{m.reason} · {m.by}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
