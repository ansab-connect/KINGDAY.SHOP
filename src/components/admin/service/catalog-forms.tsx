"use client";

import { ActionForm, FieldError, TextField } from "@/components/forms/action-form";
import {
  saveServiceCategoryAction,
  saveServiceItemAction,
  saveServiceOptionAction,
  saveServiceTypeAction,
} from "@/features/service/catalog-actions";
import type { ServiceCategory, ServiceItem, ServiceOption, ServiceType } from "@/features/service/catalog";

const selectCls =
  "h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm";
const rupees = (p: number | undefined) => (p ? String(p / 100) : "");

function Active({ value }: { value?: boolean }) {
  return (
    <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-deep">
      <input type="checkbox" name="is_active" defaultChecked={value ?? true} className="size-4 accent-[#4B0082]" /> Active (shown to customers)
    </label>
  );
}

function Select({ label, name, value, options, state, empty }: { label: string; name: string; value?: string | null; options: { value: string; label: string }[]; state: Parameters<typeof FieldError>[0]["state"]; empty?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-deep">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={selectCls}>
        {empty !== undefined ? <option value="">{empty}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <FieldError state={state} name={name} />
    </label>
  );
}

export function OptionForm({ value, types }: { value?: ServiceOption; types: ServiceType[] }) {
  return (
    <ActionForm action={saveServiceOptionAction} submitLabel={value ? "Save option" : "Add option"} resetOnSuccess={!value}>
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="id" value={value?.id ?? ""} />
          <TextField label="Title" name="title" state={state} defaultValue={value?.title} required maxLength={80} />
          <TextField label="Title (Malayalam)" name="title_ml" state={state} defaultValue={value?.title_ml ?? ""} maxLength={120} />
          <TextField label="Short name (slug)" name="slug" state={state} defaultValue={value?.slug} required maxLength={41} placeholder="e.g. fitting" />
          <TextField label="Order" name="sort_order" type="number" min={0} max={9999} state={state} defaultValue={String(value?.sort_order ?? 0)} />
          <TextField label="Description" name="description" state={state} defaultValue={value?.description ?? ""} maxLength={300} className="sm:col-span-2" />
          <TextField label="Description (Malayalam)" name="description_ml" state={state} defaultValue={value?.description_ml ?? ""} maxLength={400} className="sm:col-span-2" />
          <Select
            label="Icon"
            name="icon"
            value={value?.icon ?? "wrench"}
            state={state}
            options={["wrench", "cog", "battery", "search", "package", "sparkles", "phone"].map((i) => ({ value: i, label: i }))}
          />
          <Select
            label="Workflow"
            name="workflow"
            value={value?.workflow ?? "booking"}
            state={state}
            options={[
              { value: "booking", label: "Booking form" },
              { value: "enquiry", label: "WhatsApp enquiry" },
            ]}
          />
          <Select label="Default service type" name="default_service_type" value={value?.default_service_type} state={state} empty="None" options={types.map((t) => ({ value: t.slug, label: t.name }))} />
          <Active value={value?.is_active} />
        </div>
      )}
    </ActionForm>
  );
}

export function CategoryForm({ value, categories }: { value?: ServiceCategory; categories: ServiceCategory[] }) {
  return (
    <ActionForm action={saveServiceCategoryAction} submitLabel={value ? "Save category" : "Add category"} resetOnSuccess={!value}>
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="id" value={value?.id ?? ""} />
          <TextField label="Name" name="name" state={state} defaultValue={value?.name} required maxLength={80} />
          <TextField label="Name (Malayalam)" name="name_ml" state={state} defaultValue={value?.name_ml ?? ""} maxLength={120} />
          <TextField label="Short name (slug)" name="slug" state={state} defaultValue={value?.slug} required maxLength={41} placeholder="e.g. baby-walker" />
          <Select
            label="Parent (for a sub-category)"
            name="parent_id"
            value={value?.parent_id}
            state={state}
            empty="None (main category)"
            options={categories.filter((c) => c.id !== value?.id && !c.parent_id).map((c) => ({ value: c.id, label: c.name }))}
          />
          <TextField label="Description" name="description" state={state} defaultValue={value?.description ?? ""} maxLength={300} className="sm:col-span-2" />
          <TextField label="Order" name="sort_order" type="number" min={0} max={9999} state={state} defaultValue={String(value?.sort_order ?? 0)} />
          <Active value={value?.is_active} />
        </div>
      )}
    </ActionForm>
  );
}

export function TypeForm({ value }: { value?: ServiceType }) {
  return (
    <ActionForm action={saveServiceTypeAction} submitLabel={value ? "Save type" : "Add type"} resetOnSuccess={!value}>
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="id" value={value?.id ?? ""} />
          <TextField label="Name" name="name" state={state} defaultValue={value?.name} required maxLength={80} />
          <TextField label="Name (Malayalam)" name="name_ml" state={state} defaultValue={value?.name_ml ?? ""} maxLength={120} />
          <TextField label="Short name (slug)" name="slug" state={state} defaultValue={value?.slug} required maxLength={41} placeholder="e.g. motor" />
          <TextField label="Base charge (₹)" name="charge" type="number" min={0} step="0.01" inputMode="decimal" state={state} defaultValue={rupees(value?.base_charge_paise)} />
          <TextField label="Description" name="description" state={state} defaultValue={value?.description ?? ""} maxLength={300} className="sm:col-span-2" />
          <TextField label="Estimated time (minutes)" name="estimated_minutes" type="number" min={5} max={10080} state={state} defaultValue={value?.estimated_minutes ? String(value.estimated_minutes) : ""} />
          <TextField label="Order" name="sort_order" type="number" min={0} max={9999} state={state} defaultValue={String(value?.sort_order ?? 0)} />
          <Active value={value?.is_active} />
        </div>
      )}
    </ActionForm>
  );
}

export function ItemForm({ value, categories, types }: { value?: ServiceItem; categories: ServiceCategory[]; types: ServiceType[] }) {
  return (
    <ActionForm action={saveServiceItemAction} submitLabel={value ? "Save item" : "Add item"} resetOnSuccess={!value}>
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="id" value={value?.id ?? ""} />
          <TextField label="Name" name="name" state={state} defaultValue={value?.name} required maxLength={120} placeholder="e.g. Jeep wheel alignment" />
          <Select label="Category" name="category_id" value={value?.category_id} state={state} empty="Any" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Service type" name="service_type_id" value={value?.service_type_id} state={state} empty="Any" options={types.map((t) => ({ value: t.id, label: t.name }))} />
          <TextField label="Charge (₹)" name="charge" type="number" min={0} step="0.01" inputMode="decimal" state={state} defaultValue={rupees(value?.charge_paise)} />
          <TextField label="Description" name="description" state={state} defaultValue={value?.description ?? ""} maxLength={300} className="sm:col-span-2" />
          <TextField label="Estimated time (minutes)" name="estimated_minutes" type="number" min={5} max={10080} state={state} defaultValue={value?.estimated_minutes ? String(value.estimated_minutes) : ""} />
          <TextField label="Order" name="sort_order" type="number" min={0} max={9999} state={state} defaultValue={String(value?.sort_order ?? 0)} />
          <Active value={value?.is_active} />
        </div>
      )}
    </ActionForm>
  );
}
