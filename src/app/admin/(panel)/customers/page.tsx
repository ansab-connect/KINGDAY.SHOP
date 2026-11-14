import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminData } from "@/features/admin/source";
import { formatDate, formatPaise } from "@/lib/format";
import { StaffOnly } from "@/components/admin/staff-only";

export const metadata: Metadata = { title: "Customers" };

async function CustomersPageContent({ searchParams }: PageProps<"/admin/customers">) {
  const data = await getAdminData();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw ?? "").trim().toLowerCase().slice(0, 100);
  const customers = [...data.customers]
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")))
    .sort((a, b) => b.totalSpent - a.totalSpent || b.joinedAt.getTime() - a.joinedAt.getTime());
  return (
    <>
      <PageHeader title="Customers" description={`${data.customers.length} customers · profiles, order history and lifetime value`} />
      {data.live ? null : <PreviewNotice phase={7} />}
      <form role="search" className="mb-4 flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name, email or phone" aria-label="Search customers" />
        <Button type="submit" variant="outline">Search</Button>
      </form>
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
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    {q ? `No customers match “${q}”.` : "No customers yet. Shoppers appear here after they register."}
                  </TableCell>
                </TableRow>
              ) : null}
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-royal-50 text-xs font-semibold text-royal">
                          {c.name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-deep">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.email || `Joined ${formatDate(c.joinedAt)}`}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular md:table-cell">{c.phone || "—"}</TableCell>
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

export default function CustomersPage(props: PageProps<"/admin/customers">) {
  return (
    <StaffOnly module="customers">
      <CustomersPageContent {...props} />
    </StaffOnly>
  );
}
