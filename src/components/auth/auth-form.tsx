"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import type { AuthFormState } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

type Field = {
  name: string;
  label: string;
  type: "text" | "email" | "password" | "tel";
  autoComplete: string;
  hint?: string;
  optional?: boolean;
  inputMode?: "text" | "email" | "tel" | "numeric";
};

/**
 * Generic auth form bound to a server action. Validation happens on the server;
 * the browser only provides native hints.
 */
export function AuthForm({
  action,
  fields,
  submitLabel,
  hidden,
  tone = "light",
}: {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: Field[];
  submitLabel: string;
  hidden?: Record<string, string>;
  tone?: "light" | "dark";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [shown, setShown] = useState<Record<string, boolean>>({});

  if (state.message) {
    return (
      <p role="status" className="flex items-start gap-3 rounded-xl bg-success-soft px-4 py-4 text-sm text-success">
        <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}

      {state.error ? (
        <p role="alert" className="flex items-start gap-2.5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      {fields.map((f) => {
        const err = state.fieldErrors?.[f.name];
        const id = `auth-${f.name}`;
        return (
          <div key={f.name} className="flex flex-col gap-1.5">
            <label htmlFor={id} className={cn("text-sm font-medium", tone === "dark" ? "text-white" : "text-deep")}>
              {f.label}
            </label>
            <div className="relative">
            <input
              id={id}
              name={f.name}
              type={f.type === "password" && shown[f.name] ? "text" : f.type}
              autoComplete={f.autoComplete}
              required={!f.optional}
              inputMode={f.inputMode}
              defaultValue={f.type === "password" ? undefined : state.values?.[f.name]}
              aria-invalid={Boolean(err)}
              aria-describedby={err ? `${id}-error` : f.hint ? `${id}-hint` : undefined}
              className={cn(
                "h-12 w-full rounded-xl border bg-white px-4 text-base text-deep outline-none transition-colors focus:border-royal-300 focus:ring-3 focus:ring-royal-100 sm:text-sm",
                f.type === "password" && "pr-12",
                err ? "border-danger" : "border-input",
              )}
            />
            {f.type === "password" ? (
              <button
                type="button"
                onClick={() => setShown((s) => ({ ...s, [f.name]: !s[f.name] }))}
                aria-label={shown[f.name] ? "Hide password" : "Show password"}
                aria-pressed={Boolean(shown[f.name])}
                className="absolute inset-y-0 right-1 grid w-11 place-items-center rounded-lg text-muted-foreground hover:text-deep"
              >
                {shown[f.name] ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
              </button>
            ) : null}
            </div>
            {err ? (
              <p id={`${id}-error`} className="text-xs text-danger">{err}</p>
            ) : f.hint ? (
              <p id={`${id}-hint`} className={cn("text-xs", tone === "dark" ? "text-white/60" : "text-muted-foreground")}>{f.hint}</p>
            ) : null}
          </div>
        );
      })}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-royal text-sm font-semibold text-white transition-colors hover:bg-royal-800 disabled:opacity-60"
      >
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        {submitLabel}
      </button>
    </form>
  );
}
