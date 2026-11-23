import type { Metadata } from "next";
import Link from "next/link";
import { ClickableRow } from "@/components/admin/clickable-row";
import { ChevronRight, CornerDownRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { StaffOnly } from "@/components/admin/staff-only";
import { Pill } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCategories } from "@/features/catalog/admin-repo";
import { treeOrder } from "@/features/catalog/category-tree";
import { previewCategories } from "@/features/preview/data";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Categories" };

type Row = { id: string; name: string; slug: string; parentName: string | null; depth: number; productCount: number; active: boolean; href: string | null };

async function loadRows(): Promise<Row[]> {
  if (!isSupabaseConfigured) {
    return previewCategories.map((c) => ({
      id: c.id, name: c.name, slug: c.slug, parentName: c.parent, depth: c.parent ? 1 : 0, productCount: c.productCount, active: c.active, href: null,
    }));
  }
  const cats = await listCategories();
  const byId = new Map(cats.map((c) => [c.id, c]));
  // Each category followed by the ones inside it, at any depth.
  return treeOrder(cats.map((c) => ({ ...c, parentId: c.parent_id }))).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    parentName: c.parent_id ? byId.get(c.parent_id)?.name ?? null : null,
    depth: c.depth,
    productCount: c.product_count,
    active: c.is_active,
    href: `/admin/categories/${c.id}`,
  }));
}

async function CategoriesContent() {
  const rows = await loadRows();
  return (
    <>
      <PageHeader
        title="Categories"
        description="Organise the catalogue into categories and subcategories"
        actions={
          <Button asChild>
            <Link href="/admin/categories/new"><Plus aria-hidden /> Add category</Link>
          </Button>
        }
      />
      {!isSupabaseConfigured ? <PreviewNotice /> : null}
      <Card className="py-0 shadow-card">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Category</TableHead>
                <TableHead className="hidden sm:table-cell">URL</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10 pr-6"><span className="sr-only">Edit</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">No categories yet.</TableCell></TableRow>
              ) : (
                rows.map((c) => (
                  <ClickableRow key={c.id} href={c.href ?? null}>
                    <TableCell className="pl-6">
                      <span className={`flex items-center gap-2 ${c.parentName ? "text-muted-foreground" : "font-medium text-deep"}`} style={{ paddingLeft: `${c.depth * 1.5}rem` }}>
                        {c.parentName ? <CornerDownRight aria-hidden className="size-3.5" /> : null}
                        {c.href ? (
                          <Link href={c.href} className="hover:text-royal">{c.name}</Link>
                        ) : (
                          c.name
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">/categories/{c.slug}</TableCell>
                    <TableCell className="text-right tabular">{c.productCount}</TableCell>
                    <TableCell>{c.active ? <Pill tone="success">Visible</Pill> : <Pill tone="neutral">Hidden</Pill>}</TableCell>
                    <TableCell className="pr-6">{c.href ? <ChevronRight aria-hidden className="size-4 text-muted-foreground" /> : null}</TableCell>
                  </ClickableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function CategoriesPage() {
  return (
    <StaffOnly module="categories">
      <CategoriesContent />
    </StaffOnly>
  );
}
