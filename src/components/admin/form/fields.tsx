"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-deep outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-royal-300 focus:ring-3 focus:ring-royal-100 disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-danger";

type BaseProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  required?: boolean;
};

export function FieldShell({ id, label, error, hint, className, required, children }: BaseProps & { children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-deep">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  type = "text",
  placeholder,
  inputMode,
  prefix,
  maxLength,
  disabled,
  ...base
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number" | "email" | "url";
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  prefix?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  const input = (
    <input
      id={base.id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      maxLength={maxLength}
      disabled={disabled}
      aria-invalid={Boolean(base.error)}
      aria-describedby={base.error ? `${base.id}-error` : base.hint ? `${base.id}-hint` : undefined}
      className={cn(inputClass, prefix && "pl-7")}
    />
  );
  return (
    <FieldShell {...base}>
      {prefix ? (
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>
          {input}
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
}

export function TextAreaField({
  value,
  onChange,
  rows = 4,
  placeholder,
  maxLength,
  ...base
}: BaseProps & { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; maxLength?: number }) {
  return (
    <FieldShell {...base}>
      <textarea
        id={base.id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(base.error)}
        aria-describedby={base.error ? `${base.id}-error` : base.hint ? `${base.id}-hint` : undefined}
        className={cn(inputClass, "h-auto py-2 leading-relaxed")}
      />
      {maxLength ? <p className="-mt-1 text-right text-[0.7rem] text-muted-foreground tabular">{value.length}/{maxLength}</p> : null}
    </FieldShell>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  placeholder,
  ...base
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}) {
  return (
    <FieldShell {...base}>
      <select
        id={base.id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(base.error)}
        className={inputClass}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
    </FieldShell>
  );
}

export function SwitchField({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-3">
      <span>
        <span className="block text-sm font-medium text-deep">{label}</span>
        {description ? <span className="block text-xs text-muted-foreground">{description}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-royal peer-focus-visible:ring-3 peer-focus-visible:ring-royal-200" />
        <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function FormSection({ title, description, children, aside }: { title: string; description?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-base font-semibold text-deep">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {aside}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function FormStatus({ status }: { status: { kind: "error" | "success"; text: string } | null }) {
  if (!status) return null;
  const ok = status.kind === "success";
  return (
    <p
      role={ok ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-xl px-4 py-3 text-sm",
        ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
      )}
    >
      {ok ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
      {status.text}
    </p>
  );
}
