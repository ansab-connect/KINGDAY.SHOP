import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { BicycleManager, type ManagerData } from "@/components/admin/catalog/bicycle-manager";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { StaffOnly } from "@/components/admin/staff-only";
import { Button } from "@/components/ui/button";
import { listCategories } from "@/features/catalog/admin-repo";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bicycles" };

async function load(): Promise<ManagerData | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const [cats, fitsRes, productsRes, productFitsRes] = await Promise.all([
    listCategories(),
    supabase.from("bicycle_fits").select("category_id, kind, wheel_size_inch, age_min, age_max, height_min_cm, height_max_cm, model_based, audience"),
    supabase.from("products").select("id, name, status, category_id").order("name").limit(2000),
    supabase.from("product_bicycle_fits").select("product_id, age_min, age_max, height_min_cm, height_max_cm, note"),
  ]);
  if (fitsRes.error) return null;
  const fits = new Map((fitsRes.data ?? []).map((f) => [f.category_id as string, f]));
  const root = cats.find((c) => fits.get(c.id)?.kind === "root") ?? null;
  if (!root) return null;
  const types = cats
    .filter((c) => c.parent_id === root.id && fits.get(c.id)?.kind === "type")
    .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      active: t.is_active,
      productCount: t.product_count,
      audience: (fits.get(t.id)?.audience ?? "any") as ManagerData["types"][number]["audience"],
      sizes: cats
        .filter((c) => c.parent_id === t.id && fits.get(c.id)?.kind === "size")
        .map((s) => {
          const f = fits.get(s.id)!;
          return {
            id: s.id,
            name: s.name,
            slug: s.slug,
            active: s.is_active,
            productCount: s.product_count,
            inch: Number(f.wheel_size_inch),
            ageMin: f.age_min as number | null,
            ageMax: f.age_max as number | null,
            heightMin: f.height_min_cm as number | null,
            heightMax: f.height_max_cm as number | null,
            modelBased: Boolean(f.model_based),
          };
        }),
    }));
  const productFits = new Map((productFitsRes.data ?? []).map((f) => [f.product_id as string, f]));
  const products = (productsRes.data ?? []).map((p) => {
    const f = productFits.get(p.id as string);
    return {
      id: p.id as string,
      name: p.name as string,
      status: p.status as string,
      categoryId: (p.category_id as string | null) ?? null,
      categoryName: cats.find((c) => c.id === p.category_id)?.name ?? "—",
      fit: f
        ? { ageMin: f.age_min as number | null, ageMax: f.age_max as number | null, heightMin: f.height_min_cm as number | null, heightMax: f.height_max_cm as number | null, note: (f.note as string | null) ?? "" }
        : null,
    };
  });
  return { root: { id: root.id, name: root.name, slug: root.slug }, types, products };
}

async function BicyclesContent() {
  const data = await load();
  return (
    <>
      <PageHeader
        title="Bicycles"
        description="Types, wheel sizes, age and height ranges for the “Find Your Perfect Bicycle” finder"
        actions={
          <Button asChild variant="outline">
            <Link href="/bicycle-finder" target="_blank"><ExternalLink aria-hidden /> Open finder</Link>
          </Button>
        }
      />
      {!isSupabaseConfigured ? <PreviewNotice /> : null}
      {data ? (
        <BicycleManager data={data} />
      ) : isSupabaseConfigured ? (
        <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
          The bicycle tables aren&apos;t set up yet. Apply database migration 0036 (bicycle finder) first.
        </p>
      ) : null}
    </>
  );
}

export default function BicyclesAdminPage() {
  return (
    <StaffOnly module="categories">
      <BicyclesContent />
    </StaffOnly>
  );
}
