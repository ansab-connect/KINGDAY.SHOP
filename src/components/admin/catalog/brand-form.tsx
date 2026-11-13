"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { DeleteButton } from "@/components/admin/catalog/delete-button";
import { FormSection, FormStatus, SwitchField, TextAreaField, TextField } from "@/components/admin/form/fields";
import { SingleImageUpload } from "@/components/admin/form/single-image-upload";
import { deleteBrand, saveBrand } from "@/features/catalog/admin-actions";
import type { AdminBrand } from "@/features/catalog/admin-repo";
import { slugify } from "@/features/catalog/schemas";

export function BrandForm({ brand, canDelete }: { brand: AdminBrand | null; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(Boolean(brand));
  const [v, setV] = useState({
    name: brand?.name ?? "",
    slug: brand?.slug ?? "",
    description: brand?.description ?? "",
    logo_path: brand?.logo_path ?? null,
    is_active: brand?.is_active ?? true,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveBrand({ ...v, id: brand?.id ?? null, logo_path: v.logo_path ?? "" });
      if (r.ok) {
        setErrors({});
        setStatus({ kind: "success", text: r.message ?? "Saved." });
        if (!brand) router.push(`/admin/brands/${r.data.id}`);
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
        <FormSection title="Brand">
          <TextField
            id="brand-name"
            label="Name"
            required
            maxLength={80}
            value={v.name}
            error={errors.name}
            onChange={(name) => setV((p) => ({ ...p, name, slug: slugTouched ? p.slug : slugify(name) }))}
          />
          <TextField
            id="brand-slug"
            label="URL slug"
            value={v.slug}
            error={errors.slug}
            hint={`kingday.shop/shop?brand=${v.slug || "…"}`}
            onChange={(slug) => {
              setSlugTouched(true);
              setV((p) => ({ ...p, slug }));
            }}
          />
          <TextAreaField id="brand-desc" label="Description" rows={5} maxLength={1000} value={v.description} error={errors.description} onChange={(description) => setV((p) => ({ ...p, description }))} />
          <SingleImageUpload id="brand-logo" label="Logo" bucket="brand-logos" folder="brands" value={v.logo_path} onChange={(logo_path) => setV((p) => ({ ...p, logo_path }))} maxEdge={600} />
        </FormSection>
      </div>
      <div className="flex flex-col gap-6">
        <FormSection title="Visibility">
          <SwitchField id="brand-active" label="Visible in store" checked={v.is_active} onChange={(is_active) => setV((p) => ({ ...p, is_active }))} />
        </FormSection>
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
            {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
            Save brand
          </button>
          <Link href="/admin/brands" className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium text-deep hover:bg-muted">Cancel</Link>
        </div>
        {brand && canDelete ? <DeleteButton label="brand" redirectTo="/admin/brands" onDelete={() => deleteBrand(brand.id)} /> : null}
      </div>
    </form>
  );
}
