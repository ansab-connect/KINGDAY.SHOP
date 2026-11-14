"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { FormNotice } from "@/components/forms/action-form";
import { sendPromotionAction } from "@/features/push/actions";
import type { FormState } from "@/features/forms";
import { cn } from "@/lib/utils";

export function PromotionForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(sendPromotionAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Send this promotion to every customer who opted in to offers?")) e.preventDefault();
      }}
      className="flex max-w-xl flex-col gap-4"
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
        Title
        <input name="title" required minLength={3} maxLength={120} placeholder="e.g. Children's Day sale: up to 30% off" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
        Message
        <textarea name="body" rows={3} maxLength={300} placeholder="Short and clear. Shown on the phone's lock screen." className={cn(inputClass, "h-auto py-2")} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
        Opens page
        <input name="link" defaultValue="/offers" maxLength={200} className={inputClass} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />} Send promotion
        </button>
        <FormNotice state={state} />
      </div>
    </form>
  );
}
