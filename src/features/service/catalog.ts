import "server-only";
import { SERVICE_CATEGORIES, SERVICE_TYPES } from "@/features/service/constants";
import { createClient } from "@/lib/supabase/server";

/**
 * BEST FIT service catalog (migration 0026): landing options, categories (with
 * sub-categories), service types and service items. Nothing here is hard-coded;
 * Admins manage it in Service Management → Catalog. RLS shows customers only active rows.
 */

export type ServiceOption = {
  id: string;
  slug: string;
  title: string;
  title_ml: string | null;
  description: string | null;
  description_ml: string | null;
  icon: "wrench" | "cog" | "battery" | "search" | "package" | "sparkles" | "phone";
  workflow: "booking" | "enquiry";
  default_service_type: string | null;
  sort_order: number;
  is_active: boolean;
};
export type ServiceCategory = {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  name_ml: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};
export type ServiceType = {
  id: string;
  slug: string;
  name: string;
  name_ml: string | null;
  description: string | null;
  base_charge_paise: number;
  estimated_minutes: number | null;
  sort_order: number;
  is_active: boolean;
};
export type ServiceItem = {
  id: string;
  category_id: string | null;
  service_type_id: string | null;
  name: string;
  description: string | null;
  charge_paise: number;
  estimated_minutes: number | null;
  sort_order: number;
  is_active: boolean;
};

export type ServiceCatalog = { options: ServiceOption[]; categories: ServiceCategory[]; types: ServiceType[]; items: ServiceItem[] };

function fallbackCatalog(): ServiceCatalog {
  const base = { description: null, sort_order: 0, is_active: true };
  return {
    options: [
      {
        ...base,
        id: "fallback-service",
        slug: "service",
        title: "Service Booking",
        title_ml: "സർവീസ് ബുക്കിംഗ്",
        description: "Repair, battery or general service.",
        description_ml: null,
        icon: "wrench",
        workflow: "booking",
        default_service_type: "repair",
      },
    ],
    categories: SERVICE_CATEGORIES.map((c, i) => ({ ...base, id: `fallback-${c.value}`, parent_id: null, slug: c.value, name: c.en, name_ml: c.ml, sort_order: i })),
    types: SERVICE_TYPES.map((t, i) => ({ ...base, id: `fallback-${t.value}`, slug: t.value, name: t.en, name_ml: t.ml, base_charge_paise: 0, estimated_minutes: null, sort_order: i })),
    items: [],
  };
}

/** Active entries for customers; everything for managers (RLS decides). */
export async function getServiceCatalog(): Promise<ServiceCatalog> {
  const supabase = await createClient();
  const [o, c, t, i] = await Promise.all([
    supabase.from("service_options").select("*").order("sort_order").order("title"),
    supabase.from("service_categories").select("*").order("sort_order").order("name"),
    supabase.from("service_types").select("*").order("sort_order").order("name"),
    supabase.from("service_items").select("*").order("sort_order").order("name"),
  ]);
  // Catalog tables not installed yet (migration 0026 pending): fall back to the built-in defaults.
  if (o.error && c.error) return fallbackCatalog();
  return {
    options: (o.data ?? []) as ServiceOption[],
    categories: (c.data ?? []) as ServiceCategory[],
    types: (t.data ?? []) as ServiceType[],
    items: (i.data ?? []) as ServiceItem[],
  };
}

/** slug → display name maps for bookings, timelines and invoices. */
export async function getServiceLabels(): Promise<{ category: Record<string, string>; type: Record<string, string>; kind: Record<string, string> }> {
  const { categories, types, options } = await getServiceCatalog();
  return {
    category: Object.fromEntries(categories.map((c) => [c.slug, c.name])),
    type: Object.fromEntries(types.map((t) => [t.slug, t.name])),
    kind: Object.fromEntries(options.map((k) => [k.slug, k.title])),
  };
}
