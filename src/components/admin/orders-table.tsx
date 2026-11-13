import Link from "next/link";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus } from "@/features/orders/types";
import { getAdminData } from "@/features/admin/source";
import { formatDateTime, formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function OrdersTable({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = (first(params.q) ?? "").trim().toLowerCase().slice(0, 100);
  const statusParam = first(params.status);
  const status = ORDER_STATUSES.includes(statusParam as OrderStatus) ? (statusParam as OrderStatus) : null;

  const { orders: previewOrders, live } = await getAdminData();
  const counts = new Map<OrderStatus, number>();
  for (const o of previewOrders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);

  const rows = previewOrders.filter(
    (o) =>
      (!status || o.status === status) &&
      (!q ||
        o.number.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q) ||
        (o.email ?? "").toLowerCase().includes(q) ||
        (!!o.phone && o.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")))),
  );

  const href = (s: OrderStatus | null, query: string = q) => {
    const sp = new URLSearchParams();
    if (s) sp.set("status", s);
    if (query) sp.set("q", query);
    const str = sp.toString();
    return str ? `/admin/orders?${str}` : "/admin/orders";
  };

  return (
    <>
      <nav aria-label="Filter by status" className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {[null, ...ORDER_STATUSES].map((s) => {
          const active = s === status;
          return (
            <Link
              key={s ?? "all"}
              href={href(s)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "border-royal bg-royal text-white" : "bg-card text-muted-foreground hover:border-royal-200 hover:text-royal",
              )}
            >
              {s ? ORDER_STATUS_LABEL[s] : "All"}
              <span className={cn("rounded-full px-1.5 text-xs tabular", active ? "bg-white/15" : "bg-muted")}>
                {s ? (counts.get(s) ?? 0) : previewOrders.length}
              </span>
            </Link>
          );
        })}
      </nav>

      {q ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {rows.length} result{rows.length === 1 ? "" : "s"} for “{q}” ·{" "}
          <Link href={href(status, "")} className="font-medium text-royal underline-offset-4 hover:underline">
            clear search
          </Link>
        </p>
      ) : null}

      <Card className="py-0 shadow-card">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Payment</TableHead>
                <TableHead className="hidden lg:table-cell">Method</TableHead>
                <TableHead className="pr-6 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">{previewOrders.length === 0 ? "No orders yet. New orders will appear here." : "No orders match these filters."}</TableCell>
                </TableRow>
              ) : (
                rows.slice(0, 100).map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="pl-6">
                      {live ? (
                        <Link href={`/admin/orders/${o.id}`} className="font-medium text-royal underline-offset-4 hover:underline">{o.number}</Link>
                      ) : (
                        <span className="font-medium text-deep">{o.number}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">{formatDateTime(o.placedAt)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-44 truncate">{o.customerName}</span>
                      <span className="block text-xs text-muted-foreground">{o.city}</span>
                    </TableCell>
                    <TableCell className="hidden tabular md:table-cell">{o.items}</TableCell>
                    <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                    <TableCell className="hidden sm:table-cell"><PaymentStatusBadge status={o.paymentStatus} /></TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{o.paymentMethod === "cod" ? "Cash on delivery" : "Razorpay"}</TableCell>
                    <TableCell className="pr-6 text-right font-medium tabular">{formatPaise(o.total)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {rows.length > 100 ? (
        <p className="mt-3 text-center text-xs text-muted-foreground">Showing the latest 100 of {rows.length}. Search or filter by status to narrow down.</p>
      ) : null}
    </>
  );
}
