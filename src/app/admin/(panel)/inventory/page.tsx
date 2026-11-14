import type { Metadata } from "next";
import { AlertTriangle, ArrowUpFromLine, Boxes } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { StatCard } from "@/components/admin/stat-card";
import { Pill, StockBadge } from "@/components/admin/status-badge";
import { StockAdjustForm } from "@/components/admin/stock-adjust-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminData } from "@/features/admin/source";
import type { StockMovementType } from "@/features/preview/data";
import { formatDateTime, formatNumber, formatPaise } from "@/lib/format";
import { StaffOnly } from "@/components/admin/staff-only";

export const metadata: Metadata = { title: "Inventory" };

const movementLabel: Record<StockMovementType, { label: string; tone: "success" | "info" | "warning" | "neutral" | "royal" }> = {
  opening: { label: "Opening", tone: "neutral" },
  stock_in: { label: "Stock in", tone: "success" },
  stock_out: { label: "Stock out", tone: "warning" },
  adjustment: { label: "Adjustment", tone: "warning" },
  sale: { label: "Sale", tone: "royal" },
  return: { label: "Return", tone: "info" },
  sale_reversal: { label: "Sale reversed", tone: "info" },
  purchase: { label: "Purchase", tone: "success" },
};

async function InventoryPageContent() {
  const data = await getAdminData();
  const previewProducts = data.stock;
  const previewStockMovements = data.movements;
  const units = previewProducts.reduce((s, p) => s + p.stock, 0);
  const value = previewProducts.reduce((s, p) => s + p.stock * p.price, 0);
  const low = previewProducts.filter((p) => p.stock > 0 && p.stock <= p.reorderLevel).length;
  const out = previewProducts.filter((p) => p.stock === 0).length;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="SKU-wise stock, movements and adjustments"
      />
      {data.live ? null : <PreviewNotice phase={6} />}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Units in stock" value={formatNumber(units)} icon={Boxes} tone="royal" />
        <StatCard label="Stock value (selling)" value={formatPaise(value)} icon={ArrowUpFromLine} tone="gold" />
        <StatCard label="Low stock SKUs" value={formatNumber(low)} icon={AlertTriangle} tone="warning" />
        <StatCard label="Out of stock SKUs" value={formatNumber(out)} icon={AlertTriangle} tone="neutral" />
      </section>

      <Card id="adjust" className="mt-6 shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-base">Record a stock change</CardTitle>
          <CardDescription>Stock in, stock out, returns and count corrections. Every change is logged with your name and reason.</CardDescription>
        </CardHeader>
        <CardContent>
          <StockAdjustForm
            disabled={!data.live}
            skus={data.stock.map((p) => ({ id: p.variantId, label: `${p.sku} · ${p.name}`, stock: p.stock }))}
          />
        </CardContent>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="shadow-card xl:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-base">Stock by SKU</CardTitle>
            <CardDescription>Lowest stock first · amber at or below each SKU&apos;s reorder level</CardDescription>
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
                {previewProducts.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="py-10 text-center text-muted-foreground">No SKUs yet.</TableCell></TableRow>
                ) : null}
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
                {previewStockMovements.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No stock movements recorded yet.</TableCell></TableRow>
                ) : null}
                {previewStockMovements.slice(0, 25).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="pl-6 text-xs text-muted-foreground">{formatDateTime(m.at)}</TableCell>
                    <TableCell className="text-xs font-medium">{m.sku}</TableCell>
                    <TableCell><Pill tone={movementLabel[m.type].tone}>{movementLabel[m.type].label}</Pill></TableCell>
                    <TableCell className={`text-right font-medium tabular ${m.quantity < 0 ? "text-danger" : "text-success"}`}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </TableCell>
                    <TableCell className="hidden text-right tabular md:table-cell">{m.balance}</TableCell>
                    <TableCell className="hidden pr-6 text-xs text-muted-foreground lg:table-cell">{m.reason || "—"}</TableCell>
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

export default function InventoryPage() {
  return (
    <StaffOnly module="inventory">
      <InventoryPageContent />
    </StaffOnly>
  );
}
