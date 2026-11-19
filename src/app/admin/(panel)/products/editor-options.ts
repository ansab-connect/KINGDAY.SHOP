import "server-only";
import { listBrands, listCategories, listVariantOptionTypes } from "@/features/catalog/admin-repo";
import { previewBrands, previewCategories } from "@/features/preview/data";
import { isSupabaseConfigured } from "@/lib/env";

/** Category and brand choices for the product editor (preview data when Supabase is off). */
export async function loadEditorOptions() {
  if (!isSupabaseConfigured) {
    const parents = new Map(previewCategories.filter((c) => !c.parent).map((c) => [c.name, c.id]));
    return {
      categories: previewCategories.map((c) => ({ id: c.id, name: c.name, parent_id: c.parent ? parents.get(c.parent) ?? null : null })),
      brands: previewBrands.map((b) => ({ id: b.id, name: b.name })),
      optionTypes: ["Size", "Colour", "Model", "Voltage", "Age group", "Material"],
    };
  }
  const [categories, brands, optionTypes] = await Promise.all([listCategories(), listBrands(), listVariantOptionTypes()]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id })),
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    optionTypes,
  };
}
