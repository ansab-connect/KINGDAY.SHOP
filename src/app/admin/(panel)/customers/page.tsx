import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previewCustomers } from "@/features/preview/data";
import { formatDate, formatPaise } from "@/lib/format";
import { StaffOnly } from "@/components/admin/staff-only";

export const metadata: Metadata = { title: "Customers" };

function CustomersPageContent() {
  const customers = [...previewCustomers].sort((a, b) => b.totalSpent - a.totalSpent);
  return (
    <>
      <PageHeader title="Customers" description={`${customers.length} customers · profiles, order history and lifetime value`} />
      <PreviewNotice phase={7} />
      <Card className="py-0 shadow-card">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Customer</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden sm:table-cell">City</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Total spent</TableHead>
                <TableHead className="hidden pr-6 lg:table-cell">Last order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-royal-50 text-xs font-semibold text-royal">
                          {c.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-deep">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular md:table-cell">{c.phone}</TableCell>
                  <TableCell className="hidden sm:table-cell">{c.city}</TableCell>
                  <TableCell className="text-right tabular">{c.orders}</TableCell>
                  <TableCell className="text-right font-medium tabular">{formatPaise(c.totalSpent)}</TableCell>
                  <TableCell className="hidden pr-6 text-muted-foreground lg:table-cell">{c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function CustomersPage() {
  return (
    <StaffOnly>
      <CustomersPageContent />
    </StaffOnly>
  );
}
