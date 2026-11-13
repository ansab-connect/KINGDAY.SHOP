import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { Pill } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PREVIEW_TODAY, previewCoupons } from "@/features/preview/data";
import { formatDate, formatPaise } from "@/lib/format";
import { StaffOnly } from "@/components/admin/staff-only";

export const metadata: Metadata = { title: "Coupons" };

function CouponsPageContent() {
  return (
    <>
      <PageHeader
        title="Coupons"
        description="Percentage and fixed discounts with limits and expiry"
        actions={<Button disabled><Plus aria-hidden /> Create coupon</Button>}
      />
      <PreviewNotice phase={8} />
      <Card className="py-0 shadow-card">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="hidden md:table-cell">Min. order</TableHead>
                <TableHead className="hidden sm:table-cell">Usage</TableHead>
                <TableHead className="hidden lg:table-cell">Expires</TableHead>
                <TableHead className="pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewCoupons.map((c) => {
                const expired = c.expiresAt < PREVIEW_TODAY;
                const exhausted = c.limit !== null && c.used >= c.limit;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="pl-6">
                      <code className="rounded-md bg-royal-50 px-2 py-1 font-mono text-xs font-semibold tracking-wider text-royal">{c.code}</code>
                    </TableCell>
                    <TableCell className="font-medium">{c.type === "percentage" ? `${c.value}% off` : `${formatPaise(c.value)} off`}</TableCell>
                    <TableCell className="hidden tabular md:table-cell">{formatPaise(c.minOrder)}</TableCell>
                    <TableCell className="hidden tabular sm:table-cell">{c.used}{c.limit ? ` / ${c.limit}` : " · unlimited"}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{formatDate(c.expiresAt)}</TableCell>
                    <TableCell className="pr-6">
                      {expired ? <Pill tone="neutral">Expired</Pill> : exhausted ? <Pill tone="warning">Limit reached</Pill> : c.active ? <Pill tone="success">Active</Pill> : <Pill tone="neutral">Paused</Pill>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function CouponsPage() {
  return (
    <StaffOnly minimum="admin">
      <CouponsPageContent />
    </StaffOnly>
  );
}
