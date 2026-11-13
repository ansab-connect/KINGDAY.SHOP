import type { Metadata } from "next";
import { CornerDownRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { Pill } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previewCategories } from "@/features/preview/data";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="Organise the catalogue into categories and subcategories"
        actions={<Button disabled><Plus aria-hidden /> Add category</Button>}
      />
      <PreviewNotice phase={5} />
      <Card className="py-0 shadow-card">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Category</TableHead>
                <TableHead className="hidden sm:table-cell">URL</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead className="pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewCategories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-6">
                    <span className={`flex items-center gap-2 ${c.parent ? "pl-6 text-muted-foreground" : "font-medium text-deep"}`}>
                      {c.parent ? <CornerDownRight aria-hidden className="size-3.5" /> : null}
                      {c.name}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">/categories/{c.slug}</TableCell>
                  <TableCell className="text-right tabular">{c.productCount}</TableCell>
                  <TableCell className="pr-6">{c.active ? <Pill tone="success">Visible</Pill> : <Pill tone="neutral">Hidden</Pill>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
