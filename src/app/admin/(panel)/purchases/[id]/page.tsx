import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPurchaseBill } from "@/features/purchases/queries";
import { PURCHASE_PAYMENT_MODES } from "@/features/purchases/shared";
import { formatDate, formatPaise } from "@/lib/format";

export const metadata: Metadata = { title: "Purchase" };

type Item = {
  id: string;
  description: string;
  quantity: number;
  unit_cost_paise: number;
  gst_rate: number;
  line_total_paise: number;
  position: number;
  variant_id: string | null;
  variant: { sku: string; product: { id: string; name: string } | null } | null;
};

async function PurchaseView({ params, searchParams }: { params: PageProps<"/admin/purchases/[id]">["params"]; searchParams: PageProps<"/admin/purchases/[id]">["searchParams"] }) {
  const { id } = await params;
  const sp = await searchParams;
  const bill = await getPurchaseBill(id);
  if (!bill) notFound();
  const items = [...((bill.purchase_bill_items ?? []) as unknown as Item[])].sort((a, b) => a.position - b.position);
  const n = (v: unknown) => Number(v ?? 0);
  const due = Math.max(0, n(bill.total_paise) - n(bill.paid_paise));
  const stocked = items.filter((i) => i.variant_id);

  return (
    <>
      <Link href="/admin/purchases" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-royal">
        <ArrowLeft aria-hidden className="size-4" /> All purchases
      </Link>
      <PageHeader title={`${bill.supplier_name as string}`} description={`${bill.bill_number as string}${bill.supplier_bill_no ? ` · Supplier bill ${bill.supplier_bill_no as string}` : ""} · ${formatDate(new Date(bill.bill_date as string))}`} />
      {sp.saved ? (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 aria-hidden className="size-4" /> Purchase saved. Stock added for {stocked.length} product line{stocked.length === 1 ? "" : "s"} ({stocked.reduce((s, i) => s + i.quantity, 0)} units).
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card className="py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">GST</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <span className="font-medium text-deep">{i.description}</span>
                      {i.variant?.product ? (
                        <Link href={`/admin/products/${i.variant.product.id}`} className="block text-xs text-success hover:underline">
                          + stock: {i.variant.product.name} ({i.variant.sku})
                        </Link>
                      ) : (
                        <span className="block text-xs text-muted-foreground">No stock (not a product)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular">{i.quantity}</TableCell>
                    <TableCell className="text-right tabular">{formatPaise(n(i.unit_cost_paise))}</TableCell>
                    <TableCell className="hidden text-right tabular sm:table-cell">{n(i.gst_rate)}%</TableCell>
                    <TableCell className="text-right font-medium tabular">{formatPaise(n(i.line_total_paise))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardContent className="grid gap-1.5 text-sm">
              <Row k="Before GST" v={formatPaise(n(bill.subtotal_paise))} />
              <Row k="GST" v={formatPaise(n(bill.tax_paise))} />
              {n(bill.other_charges_paise) ? <Row k="Other charges" v={formatPaise(n(bill.other_charges_paise))} /> : null}
              <div className="flex justify-between border-t pt-2 text-base font-bold text-deep">
                <span>Total</span>
                <span className="tabular">{formatPaise(n(bill.total_paise))}</span>
              </div>
              <Row k="Paid" v={`${formatPaise(n(bill.paid_paise))}${bill.payment_mode ? ` (${PURCHASE_PAYMENT_MODES.find((m) => m.value === bill.payment_mode)?.label ?? bill.payment_mode})` : ""}`} />
              {due ? <Row k="Still to pay" v={formatPaise(due)} /> : null}
              {bill.supplier_gstin ? <Row k="GSTIN" v={bill.supplier_gstin as string} /> : null}
              {bill.notes ? <p className="mt-2 text-muted-foreground">{bill.notes as string}</p> : null}
            </CardContent>
          </Card>
          {bill.imageUrl ? (
            <a href={bill.imageUrl} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-2xl border bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed private image */}
              <img src={bill.imageUrl} alt="Supplier bill photo" className="max-h-96 w-full object-contain" />
              <span className="flex items-center justify-center gap-1.5 border-t py-2 text-sm font-medium text-royal group-hover:underline">
                Open bill photo <ExternalLink aria-hidden className="size-3.5" />
              </span>
            </a>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium text-deep tabular">{v}</span>
    </div>
  );
}

export default function PurchasePage(props: PageProps<"/admin/purchases/[id]">) {
  return (
    <StaffOnly module="purchases">
      <PurchaseView params={props.params} searchParams={props.searchParams} />
    </StaffOnly>
  );
}
