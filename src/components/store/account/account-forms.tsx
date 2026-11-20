"use client";

import { useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { fieldClass } from "@/components/store/account/account-shell";
import { deleteAddressAction, removeWishlistItemAction, saveAddressAction, updateProfileAction } from "@/features/account/actions";
import type { Address, Profile } from "@/features/account/queries";
import type { FormState } from "@/features/forms";

function Field({ name, label, state, defaultValue, type = "text", autoComplete, required }: {
  name: string; label: string; state: FormState; defaultValue?: string | null; type?: string; autoComplete?: string; required?: boolean;
}) {
  const err = state.fieldErrors?.[name];
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
      <span>{label}{required ? <span className="text-danger"> *</span> : null}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} autoComplete={autoComplete} aria-invalid={Boolean(err)} className={fieldClass} />
      {err ? <span className="text-xs font-normal text-danger">{err}</span> : null}
    </label>
  );
}

export function ProfileForm({ profile, email }: { profile: Profile | null; email: string | null }) {
  return (
    <ActionForm action={updateProfileAction} submitLabel="Save profile" className="max-w-xl">
      {(state) => (
        <>
          <Field name="full_name" label="Full name" state={state} defaultValue={profile?.full_name} autoComplete="name" required />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
            Email
            <input value={email ?? ""} readOnly className={`${fieldClass} bg-muted text-muted-foreground`} />
          </label>
          <Field name="phone" label="Mobile number" type="tel" state={state} defaultValue={profile?.phone} autoComplete="tel" />
          <label className="flex items-center gap-2.5 text-sm text-deep">
            <input type="checkbox" name="marketing_opt_in" defaultChecked={profile?.marketing_opt_in} className="size-4 accent-royal" />
            Email me offers and new arrivals
          </label>
        </>
      )}
    </ActionForm>
  );
}

export function AddressBook({ addresses }: { addresses: Address[] }) {
  const [editing, setEditing] = useState<Address | "new" | null>(addresses.length ? null : "new");
  const current = editing === "new" ? null : editing;

  return (
    <div className="flex flex-col gap-6">
      {addresses.length ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex flex-col rounded-2xl border p-5">
              <p className="flex items-center gap-2 font-heading font-semibold text-deep">
                {a.label || a.full_name}
                {a.is_default ? <span className="inline-flex items-center gap-1 rounded-full bg-gold-50 px-2 py-0.5 text-[0.7rem] text-gold-700"><Star aria-hidden className="size-3" /> Default</span> : null}
              </p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {a.full_name} · {a.phone}<br />
                {a.line1}{a.line2 ? `, ${a.line2}` : ""}{a.landmark ? `, near ${a.landmark}` : ""}<br />
                {a.city}, {a.state} {a.postal_code}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button type="button" onClick={() => setEditing(a)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-deep hover:bg-muted">
                  <Pencil aria-hidden className="size-3.5" /> Edit
                </button>
                <ActionForm action={deleteAddressAction} submitLabel="Remove" pendingLabel="Removing…" confirm="Remove this address?" className="gap-0" submitClassName="h-9 bg-transparent px-3 text-danger hover:bg-danger-soft">
                  <input type="hidden" name="id" value={a.id} />
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">You haven&apos;t saved any addresses yet.</p>
      )}

      {editing ? (
        <AddressForm current={current} firstAddress={addresses.length === 0} onCancel={current || addresses.length ? () => setEditing(null) : undefined} />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800">
          <Plus aria-hidden className="size-4" /> Add an address
        </button>
      )}
    </div>
  );
}

/** Add or edit one delivery address (account page and checkout). */
export function AddressForm({ current, firstAddress, onSaved, onCancel }: { current: Address | null; firstAddress: boolean; onSaved?: () => void; onCancel?: () => void }) {
  return (
    <section className="rounded-2xl border p-5 sm:p-6">
      <h2 className="font-heading text-lg font-semibold text-deep">{current ? "Edit address" : "Add a delivery address"}</h2>
      <ActionForm key={current?.id ?? "new"} action={saveAddressAction} submitLabel="Save address" resetOnSuccess={!current} onSuccess={onSaved} className="mt-4">
        {(state) => (
          <>
            <input type="hidden" name="id" value={current?.id ?? ""} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="full_name" label="Recipient name" state={state} defaultValue={current?.full_name} autoComplete="name" required />
              <Field name="phone" label="Mobile number" type="tel" state={state} defaultValue={current?.phone} autoComplete="tel" required />
              <div className="sm:col-span-2"><Field name="line1" label="House / building / street" state={state} defaultValue={current?.line1} autoComplete="address-line1" required /></div>
              <Field name="line2" label="Area / locality" state={state} defaultValue={current?.line2} autoComplete="address-line2" />
              <Field name="landmark" label="Landmark" state={state} defaultValue={current?.landmark} />
              <Field name="city" label="City" state={state} defaultValue={current?.city} autoComplete="address-level2" required />
              <Field name="state" label="State" state={state} defaultValue={current?.state ?? (current ? undefined : "Kerala")} autoComplete="address-level1" required />
              <Field name="postal_code" label="PIN code" state={state} defaultValue={current?.postal_code} autoComplete="postal-code" required />
              <Field name="label" label="Label (e.g. Home)" state={state} defaultValue={current?.label} />
            </div>
            <label className="flex items-center gap-2.5 text-sm text-deep">
              <input type="checkbox" name="is_default" defaultChecked={current?.is_default ?? firstAddress} className="size-4 accent-royal" />
              Use as my default delivery address
            </label>
          </>
        )}
      </ActionForm>
      {onCancel ? (
        <button type="button" onClick={onCancel} className="mt-3 text-sm text-muted-foreground hover:text-deep">Cancel</button>
      ) : null}
    </section>
  );
}

export function RemoveWishlistItem({ productId }: { productId: string }) {
  return (
    <ActionForm action={removeWishlistItemAction} submitLabel="Remove" pendingLabel="Removing…" className="gap-0" submitClassName="h-9 bg-transparent px-3 text-danger hover:bg-danger-soft">
      <input type="hidden" name="product_id" value={productId} />
      <span className="sr-only"><Trash2 aria-hidden /></span>
    </ActionForm>
  );
}
