"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { assertCan } from "@/features/auth/session";
import { dbMessage, fail, fieldErrorsOf, ok, type FormState } from "@/features/forms";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * BEST FIT catalog editing (service "edit" permission; RLS enforces the same).
 * Rows are never deleted from here: switch them off instead, so old bookings keep their names.
 */

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,40}$/, "Use 2–41 lowercase letters, numbers, - or _.");
const optText = (max: number) => z.string().max(max).transform((v) => v || null);
const rupees = z
  .string()
  .transform((v) => (v === "" ? 0 : Number(v)))
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 100000, "Enter 0 to 1,00,000.")
  .transform((n) => Math.round(n * 100));
const minutes = z
  .string()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((n) => n === null || (Number.isInteger(n) && n >= 5 && n <= 10080), "Enter 5 to 10080 minutes.");
const order = z
  .string()
  .transform((v) => (v === "" ? 0 : Number(v)))
  .refine((n) => Number.isInteger(n) && n >= 0 && n <= 9999, "Enter 0–9999.");
const id = z.union([z.literal(""), z.uuid()]);

async function guard(): Promise<FormState | null> {
  if (!isSupabaseConfigured) return fail("Needs Supabase.");
  try {
    await assertCan("service", "edit");
    return null;
  } catch {
    return fail("You don't have permission to change the service catalog.");
  }
}

async function save(table: string, rowId: string, row: Record<string, unknown>, what: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = rowId ? await supabase.from(table).update(row).eq("id", rowId) : await supabase.from(table).insert(row);
  if (error) return fail(error.code === "23505" ? "That short name (slug) is already used." : dbMessage(error, `Couldn't save the ${what}.`));
  refresh();
  return ok(rowId ? `${what[0].toUpperCase()}${what.slice(1)} saved.` : `${what[0].toUpperCase()}${what.slice(1)} added.`);
}

export async function saveServiceOptionAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = z
    .object({
      id,
      slug,
      title: z.string().min(2, "Enter a title.").max(80),
      title_ml: optText(120),
      description: optText(300),
      description_ml: optText(400),
      icon: z.enum(["wrench", "cog", "battery", "search", "package", "sparkles", "phone"]),
      workflow: z.enum(["booking", "enquiry"]),
      default_service_type: z.string().transform((v) => v || null),
      sort_order: order,
      is_active: z.boolean(),
    })
    .safeParse({
      ...Object.fromEntries(["id", "slug", "title", "title_ml", "description", "description_ml", "icon", "workflow", "default_service_type", "sort_order"].map((k) => [k, s(fd, k)])),
      is_active: fd.get("is_active") === "on",
    });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const { id: rowId, ...row } = parsed.data;
  return save("service_options", rowId, row, "option");
}

export async function saveServiceCategoryAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = z
    .object({
      id,
      parent_id: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
      slug,
      name: z.string().min(2, "Enter a name.").max(80),
      name_ml: optText(120),
      description: optText(300),
      sort_order: order,
      is_active: z.boolean(),
    })
    .safeParse({
      ...Object.fromEntries(["id", "parent_id", "slug", "name", "name_ml", "description", "sort_order"].map((k) => [k, s(fd, k)])),
      is_active: fd.get("is_active") === "on",
    });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const { id: rowId, ...row } = parsed.data;
  if (rowId && row.parent_id === rowId) return fail("A category can't be its own parent.", { parent_id: "Choose another parent." });
  return save("service_categories", rowId, row, "category");
}

export async function saveServiceTypeAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = z
    .object({
      id,
      slug,
      name: z.string().min(2, "Enter a name.").max(80),
      name_ml: optText(120),
      description: optText(300),
      base_charge_paise: rupees,
      estimated_minutes: minutes,
      sort_order: order,
      is_active: z.boolean(),
    })
    .safeParse({
      ...Object.fromEntries(["id", "slug", "name", "name_ml", "description", "sort_order", "estimated_minutes"].map((k) => [k, s(fd, k)])),
      base_charge_paise: s(fd, "charge"),
      is_active: fd.get("is_active") === "on",
    });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const { id: rowId, ...row } = parsed.data;
  return save("service_types", rowId, row, "service type");
}

export async function saveServiceItemAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = z
    .object({
      id,
      category_id: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
      service_type_id: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
      name: z.string().min(2, "Enter a name.").max(120),
      description: optText(300),
      charge_paise: rupees,
      estimated_minutes: minutes,
      sort_order: order,
      is_active: z.boolean(),
    })
    .safeParse({
      ...Object.fromEntries(["id", "category_id", "service_type_id", "name", "description", "sort_order", "estimated_minutes"].map((k) => [k, s(fd, k)])),
      charge_paise: s(fd, "charge"),
      is_active: fd.get("is_active") === "on",
    });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const { id: rowId, ...row } = parsed.data;
  return save("service_items", rowId, row, "service item");
}
