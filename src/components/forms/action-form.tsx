"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { FormState } from "@/features/forms";
import { cn } from "@/lib/utils";

/**
 * Form bound to a server action with pending, success and error feedback.
 * Field errors are exposed through <FieldError name="…" state={…} /> or the
 * render-prop form of children.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  className,
  resetOnSuccess = false,
  submitClassName,
  confirm,
  onSuccess,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode | ((state: FormState) => React.ReactNode);
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
  submitClassName?: string;
  /** Ask before submitting (destructive actions). */
  confirm?: string;
  /** Called once after each successful submit. */
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);

  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
    if (state.ok) onSuccessRef.current?.();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={cn("flex flex-col gap-4", className)}
    >
      {typeof children === "function" ? children(state) : children}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white transition-colors hover:bg-royal-800 disabled:opacity-60",
            submitClassName,
          )}
        >
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {pending ? pendingLabel : submitLabel}
        </button>
        <FormNotice state={state} />
      </div>
    </form>
  );
}

export function FormNotice({ state }: { state: FormState }) {
  if (state.ok && state.message) {
    return (
      <p key={state.at} role="status" className="flex items-center gap-1.5 text-sm font-medium text-success animate-in fade-in">
        <CheckCircle2 aria-hidden className="size-4 shrink-0" /> {state.message}
      </p>
    );
  }
  if (state.error) {
    return (
      <p key={state.at} role="alert" className="flex items-center gap-1.5 text-sm font-medium text-danger">
        <AlertCircle aria-hidden className="size-4 shrink-0" /> {state.error}
      </p>
    );
  }
  return null;
}

export function FieldError({ state, name }: { state: FormState; name: string }) {
  const msg = state.fieldErrors?.[name];
  return msg ? <p className="text-xs font-medium text-danger">{msg}</p> : null;
}

/** Plain labelled input that matches the store's form styling. */
export function TextField({
  label,
  name,
  state,
  className,
  ...props
}: { label: string; name: string; state: FormState } & React.InputHTMLAttributes<HTMLInputElement>) {
  const err = state.fieldErrors?.[name];
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium text-deep">{label}</span>
      <input
        name={name}
        aria-invalid={err ? true : undefined}
        className="h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 aria-invalid:border-danger sm:text-sm"
        {...props}
      />
      {err ? <span className="text-xs font-medium text-danger">{err}</span> : null}
    </label>
  );
}
