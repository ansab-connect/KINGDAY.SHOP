"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { DeleteButton } from "@/components/admin/catalog/delete-button";
import { FormSection, FormStatus, SelectField, SwitchField, TextAreaField, TextField } from "@/components/admin/form/fields";
import { SingleImageUpload } from "@/components/admin/form/single-image-upload";
import { deleteCategory, saveCategory } from "@/features/catalog/admin-actions";
import type { AdminCategory } from "@/features/catalog/admin-repo";
import { slugify } from "@/features/catalog/schemas";

export function CategoryForm({
  category,
  parents,
  canDelete,
}: {
  category: AdminCategory | null;
  parents: { id: string; name: string }[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(Boolean(category));
  const [v, setV] = useState({
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    parent_id: category?.parent_id ?? "",
    description: category?.description ?? "",
    image_path: category?.image_path ?? null,
    sort_order: String(category?.sort_order ?? 0),
    is_active: category?.is_active ?? true,
    variants_as_products: category?.variants_as_products ?? false,
    no_cod: category?.no_cod ?? false,
    seo_title: category?.seo_title ?? "",
    seo_description: category?.seo_description ?? "",
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((prev) => ({ ...prev, [k]: val }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveCategory({ ...v, id: category?.id ?? null, image_path: v.image_path ?? "" });
      if (r.ok) {
        setErrors({});
        setStatus({ kind: "success", text: r.message ?? "Saved." });
        if (!category) router.push(`/admin/categories/${r.data.id}`);
        else router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        setStatus({ kind: "error", text: r.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_20rem]" noValidate>
      <div className="flex flex-col gap-6">
        <FormStatus status={status} />
        <FormSection title="Details">
          <TextField
            id="cat-name"
            label="Name"
            required
            value={v.name}
            error={errors.name}
            maxLength={80}
            onChange={(name) => setV((p) => ({ ...p, name, slug: slugTouched ? p.slug : slugify(name) }))}
          />
          <TextField
            id="cat-slug"
            label="URL slug"
            value={v.slug}
            error={errors.slug}
            hint={`www.kingday.in/categories/${v.slug || "…"}`}
            onChange={(slug) => {
              setSlugTouched(true);
              set("slug", slug);
            }}
          />
          <SelectField
            id="cat-parent"
            label="Parent category"
            value={v.parent_id}
            error={errors.parent_id}
            placeholder="None (top-level category)"
            options={parents.filter((p) => p.id !== category?.id).map((p) => ({ value: p.id, label: p.name }))}
            onChange={(val) => set("parent_id", val)}
          />
          <TextAreaField id="cat-desc" label="Description" value={v.description} maxLength={500} error={errors.description} onChange={(val) => set("description", val)} />
          <SingleImageUpload id="cat-image" label="Category image" bucket="category-images" folder="categories" value={v.image_path} onChange={(p) => set("image_path", p)} maxEdge={1200} />
        </FormSection>

        <FormSection title="Search engine listing" description="Optional. Defaults to the name and description.">
          <TextField id="cat-seo-title" label="SEO title" value={v.seo_title} maxLength={70} error={errors.seo_title} onChange={(val) => set("seo_title", val)} />
          <TextAreaField id="cat-seo-desc" label="SEO description" rows={2} value={v.seo_description} maxLength={170} error={errors.seo_description} onChange={(val) => set("seo_description", val)} />
        </FormSection>
      </div>

      <div className="flex flex-col gap-6">
        <FormSection title="Visibility">
          <SwitchField id="cat-active" label="Visible in store" checked={v.is_active} onChange={(val) => set("is_active", val)} />
          <TextField id="cat-sort" label="Sort order" type="number" inputMode="numeric" value={v.sort_order} error={errors.sort_order} hint="Lower numbers appear first." onChange={(val) => set("sort_order", val)} />
        </FormSection>
        <FormSection title="Settings" description="Off by default. Also applies to the categories inside this one.">
          <SwitchField id="cat-split" label="Show each variant as a separate product" description="E.g. a jeep in Red, Black and Blue shows as 3 products in the shop." checked={v.variants_as_products} onChange={(val) => set("variants_as_products", val)} />
          <SwitchField id="cat-nocod" label="No cash on delivery" description="Customers pay online or order on WhatsApp for these products." checked={v.no_cod} onChange={(val) => set("no_cod", val)} />
        </FormSection>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
            {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
            Save category
          </button>
          <Link href="/admin/categories" className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium text-deep hover:bg-muted">Cancel</Link>
        </div>
        {category && canDelete ? (
          <DeleteButton label="category" redirectTo="/admin/categories" onDelete={() => deleteCategory(category.id)} />
        ) : null}
      </div>
    </form>
  );
}
