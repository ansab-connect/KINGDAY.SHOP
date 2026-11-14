"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { FormNotice } from "@/components/forms/action-form";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import {
  createAccountAction,
  createSetupLinkAction,
  createStaffCategoryAction,
  deleteAccountAction,
  deleteStaffCategoryAction,
  saveRoleDefaultsAction,
  saveUserPermissionsAction,
  setAccountStatusAction,
  updateAccountAction,
} from "@/features/admin/user-actions";
import { ACTIONS, MODULES, type Permissions } from "@/features/auth/permissions";
import type { FormState } from "@/features/forms";
import { cn } from "@/lib/utils";

export type StaffCategory = { id: string; name: string; kind: "staff" | "service"; is_system: boolean };

export const ROLE_OPTIONS = [
  { value: "staff", label: "Staff" },
  { value: "service_staff", label: "Service Staff" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
] as const;

function Field({
  name,
  label,
  error,
  hint,
  required,
  className,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={`f-${name}`} className="text-sm font-medium text-deep">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SubmitButton({ pending, children, tone = "royal" }: { pending: boolean; children: React.ReactNode; tone?: "royal" | "danger" | "outline" }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-60",
        tone === "royal" && "bg-royal text-white hover:bg-royal-800",
        tone === "danger" && "bg-danger text-white hover:bg-danger/90",
        tone === "outline" && "border bg-white text-deep hover:bg-muted",
      )}
    >
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

/** One-time setup link with copy + WhatsApp share. */
export function SetupLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const wa = `https://wa.me/?text=${encodeURIComponent(`Your KING DAY staff account is ready. Set your password here (works once, about 1 hour): ${link}`)}`;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-royal-200 bg-royal-50 p-4">
      <p className="text-sm font-semibold text-deep">One-time password setup link</p>
      <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={cn(inputClass, "font-mono text-xs")} aria-label="Setup link" />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {}
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm font-semibold text-deep hover:bg-muted"
        >
          {copied ? <Check aria-hidden className="size-4 text-success" /> : <Copy aria-hidden className="size-4" />} {copied ? "Copied" : "Copy link"}
        </button>
        <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-sm font-semibold text-white hover:bg-[#1fb457]">
          <WhatsAppIcon className="size-4" /> Send on WhatsApp
        </a>
      </div>
    </div>
  );
}

function CategorySelect({ role, categories, defaultValue, error }: { role: string; categories: StaffCategory[]; defaultValue?: string; error?: string }) {
  const kind = role === "service_staff" ? "service" : role === "staff" ? "staff" : null;
  if (!kind) return <input type="hidden" name="categoryId" value="" />;
  const options = categories.filter((c) => c.kind === kind);
  return (
    <Field name="categoryId" label={kind === "service" ? "Service staff category" : "Staff category"} error={error} required>
      <select id="f-categoryId" name="categoryId" defaultValue={options.some((o) => o.id === defaultValue) ? defaultValue : ""} className={inputClass} required>
        <option value="">Choose…</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </Field>
  );
}

export type AccountDetails = {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  categoryId: string;
  designation: string;
  joiningDate: string;
};

/** Create (no `account`) or edit an account. */
export function AccountForm({ categories, account, lockRole }: { categories: StaffCategory[]; account?: AccountDetails; lockRole?: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(account ? updateAccountAction : createAccountAction, {});
  const [role, setRole] = useState(account?.role ?? "staff");
  const [access, setAccess] = useState<"password" | "link">("password");
  const fe = state.fieldErrors ?? {};
  const createdId = !account && state.ok ? state.data?.userId : undefined;

  if (createdId) {
    return (
      <div className="flex flex-col gap-4">
        <FormNotice state={state} />
        {state.data?.link ? <SetupLinkBox link={state.data.link} /> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => router.push(`/admin/users/${createdId}`)} className="inline-flex h-10 items-center rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800">
            Open account &amp; permissions
          </button>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-10 items-center rounded-lg border bg-white px-4 text-sm font-semibold text-deep hover:bg-muted">
            Create another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {account ? <input type="hidden" name="userId" value={account.userId} /> : null}
      <Field name="fullName" label="Full name" error={fe.fullName} required>
        <input id="f-fullName" name="fullName" defaultValue={account?.fullName} maxLength={120} required className={inputClass} autoComplete="off" />
      </Field>
      {account ? (
        <Field name="email" label="Email" hint="Sign-in email can't be changed here.">
          <input id="f-email" value={account.email} disabled className={inputClass} />
        </Field>
      ) : (
        <Field name="email" label="Email" error={fe.email} required hint="If this email already has an account, it is reused (no duplicate).">
          <input id="f-email" name="email" type="email" maxLength={254} required className={inputClass} autoComplete="off" />
        </Field>
      )}
      <Field name="phone" label="Phone" error={fe.phone}>
        <input id="f-phone" name="phone" type="tel" inputMode="tel" defaultValue={account?.phone} maxLength={20} className={inputClass} placeholder="+91 94959 02904" />
      </Field>
      <Field name="role" label="Role" error={fe.role} required hint={lockRole ? "The primary Super Admin always stays Super Admin." : undefined}>
        {lockRole ? <input type="hidden" name="role" value={role} /> : null}
        <select id="f-role" name={lockRole ? undefined : "role"} value={role} onChange={(e) => setRole(e.target.value)} disabled={lockRole} className={inputClass}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </Field>
      <CategorySelect key={role} role={role} categories={categories} defaultValue={account?.categoryId} error={fe.categoryId} />
      <Field name="designation" label="Designation" error={fe.designation}>
        <input id="f-designation" name="designation" defaultValue={account?.designation} maxLength={80} className={inputClass} placeholder="e.g. Senior Technician" />
      </Field>
      <Field name="joiningDate" label="Joining date" error={fe.joiningDate}>
        <input id="f-joiningDate" name="joiningDate" type="date" defaultValue={account?.joiningDate} className={inputClass} />
      </Field>

      {!account ? (
        <>
          <Field name="status" label="Account status">
            <select id="f-status" name="status" defaultValue="active" className={inputClass}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium text-deep">How will they sign in?</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="access" value="password" checked={access === "password"} onChange={() => setAccess("password")} className="mt-1 accent-royal" />
              <span><span className="font-medium text-deep">Set a password now</span> <span className="text-muted-foreground">and share it privately.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="access" value="link" checked={access === "link"} onChange={() => setAccess("link")} className="mt-1 accent-royal" />
              <span><span className="font-medium text-deep">Secure setup link</span> <span className="text-muted-foreground">they open once to choose their own password (share on WhatsApp).</span></span>
            </label>
          </fieldset>
          {access === "password" ? (
            <Field name="password" label="Password" error={fe.password} required hint="At least 8 characters.">
              <input id="f-password" name="password" type="password" minLength={8} maxLength={72} required autoComplete="new-password" className={inputClass} />
            </Field>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton pending={pending}>{account ? "Save account" : "Create account"}</SubmitButton>
        <FormNotice state={state} />
      </div>
    </form>
  );
}

export function StatusToggle({ userId, status, disabled }: { userId: string; status: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setAccountStatusAction, {});
  const next = status === "inactive" ? "active" : "inactive";
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (next === "inactive" && !window.confirm("Deactivate this account? They are signed out of all staff pages and can't sign in.")) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={next} />
      {disabled ? (
        <p className="text-sm text-muted-foreground">This account can&apos;t be deactivated.</p>
      ) : (
        <SubmitButton pending={pending} tone={next === "inactive" ? "outline" : "royal"}>{next === "inactive" ? "Deactivate account" : "Reactivate account"}</SubmitButton>
      )}
      <FormNotice state={state} />
    </form>
  );
}

export function SetupLinkButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createSetupLinkAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} tone="outline">
          <KeyRound aria-hidden className="size-4" /> Create password setup link
        </SubmitButton>
        {!state.data?.link ? <FormNotice state={state} /> : null}
      </div>
      {state.data?.link ? <SetupLinkBox link={state.data.link} /> : null}
    </form>
  );
}

export function DeleteAccount({ userId }: { userId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccountAction, {});
  useEffect(() => {
    if (state.data?.deleted) router.push("/admin/users");
  }, [state, router]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="userId" value={userId} />
      <Field name="confirm" label="Type DELETE to confirm" error={state.fieldErrors?.confirm}>
        <input id="f-confirm" name="confirm" autoComplete="off" className={cn(inputClass, "w-44")} />
      </Field>
      <SubmitButton pending={pending} tone="danger">
        <Trash2 aria-hidden className="size-4" /> Delete permanently
      </SubmitButton>
      {!state.fieldErrors ? <FormNotice state={state} /> : null}
    </form>
  );
}

/** Checkbox grid of page × action permissions. */
function Matrix({ value, disabled }: { value: Permissions; disabled?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/60">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-semibold text-deep">Page</th>
            {ACTIONS.map((a) => (
              <th key={a} scope="col" className="px-2 py-2.5 text-center font-semibold text-deep capitalize">{a}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {MODULES.map((m) => (
            <tr key={m.key} className="hover:bg-muted/30">
              <th scope="row" className="px-4 py-2 text-left font-medium text-deep">{m.label}</th>
              {ACTIONS.map((a) => (
                <td key={a} className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    name={`perm:${m.key}:${a}`}
                    defaultChecked={value[m.key]?.includes(a)}
                    disabled={disabled}
                    aria-label={`${m.label}: ${a}`}
                    className="size-4 accent-royal"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UserPermissionsForm({ userId, custom, current, roleDefaults }: { userId: string; custom: boolean; current: Permissions; roleDefaults: Permissions }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveUserPermissionsAction, {});
  const [mode, setMode] = useState<"role" | "custom">(custom ? "custom" : "role");
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="mode" value={mode} />
      <div role="radiogroup" aria-label="Permission mode" className="inline-flex w-fit rounded-lg border bg-white p-1">
        {(["role", "custom"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn("h-8 rounded-md px-3 text-sm font-semibold", mode === m ? "bg-royal text-white" : "text-deep/70 hover:text-royal")}
          >
            {m === "role" ? "Use role defaults" : "Custom for this user"}
          </button>
        ))}
      </div>
      <Matrix key={mode} value={mode === "custom" ? (custom ? current : roleDefaults) : roleDefaults} disabled={mode === "role"} />
      <p className="text-xs text-muted-foreground">Ticking any action also gives View. The database enforces these rules on every save.</p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>Save permissions</SubmitButton>
        <FormNotice state={state} />
      </div>
    </form>
  );
}

export function RoleDefaultsForm({ role, value }: { role: string; value: Permissions }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRoleDefaultsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="role" value={role} />
      <Matrix value={value} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>Save defaults</SubmitButton>
        <FormNotice state={state} />
      </div>
    </form>
  );
}

export function StaffCategoryManager({ categories, canManage }: { categories: StaffCategory[]; canManage: boolean }) {
  const [addState, add, adding] = useActionState<FormState, FormData>(createStaffCategoryAction, {});
  const [delState, del, deleting] = useActionState<FormState, FormData>(deleteStaffCategoryAction, {});
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {(["staff", "service"] as const).map((kind) => (
          <div key={kind}>
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{kind === "staff" ? "Staff" : "Service Staff"}</p>
            <ul className="flex flex-wrap gap-2">
              {categories.filter((c) => c.kind === kind).map((c) => (
                <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-royal-50 py-1 pr-1 pl-3 text-xs font-semibold text-royal">
                  {c.name}
                  {canManage && !c.is_system ? (
                    <form action={del} onSubmit={(e) => { if (!window.confirm(`Delete “${c.name}”?`)) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" disabled={deleting} aria-label={`Delete ${c.name}`} className="grid size-5 place-items-center rounded-full hover:bg-royal-100">
                        <Trash2 className="size-3" />
                      </button>
                    </form>
                  ) : <span className="w-1" />}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {canManage ? (
        <form action={add} className="flex flex-wrap items-end gap-2">
          <Field name="name" label="New category" error={addState.fieldErrors?.name}>
            <input id="f-name" name="name" maxLength={60} required className={cn(inputClass, "w-56")} placeholder="e.g. Delivery Staff" />
          </Field>
          <select name="kind" aria-label="Category type" className={cn(inputClass, "w-40")} defaultValue="staff">
            <option value="staff">Staff</option>
            <option value="service">Service Staff</option>
          </select>
          <SubmitButton pending={adding} tone="outline">Add</SubmitButton>
        </form>
      ) : null}
      <FormNotice state={(delState.at ?? 0) > (addState.at ?? 0) ? delState : addState} />
    </div>
  );
}
