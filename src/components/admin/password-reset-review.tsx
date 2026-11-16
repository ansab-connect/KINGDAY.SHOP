"use client";

import { useActionState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { FormNotice } from "@/components/forms/action-form";
import { reviewPasswordResetAction } from "@/features/auth/password-reset";
import type { FormState } from "@/features/forms";

/** Approve or reject one request. Approving switches the new password on immediately. */
export function PasswordResetReview({ id, retry }: { id: string; retry?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(reviewPasswordResetAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const decision = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
        const msg =
          decision === "approve"
            ? "Approve? Only approve after confirming it's really them (for example by calling their registered mobile). Their new password starts working now and they are signed out everywhere."
            : "Reject this request? Their current password keeps working.";
        if (!window.confirm(msg)) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="id" value={id} />
      {!retry ? (
        <>
          <label className="sr-only" htmlFor={`note-${id}`}>Note</label>
          <input id={`note-${id}`} name="note" maxLength={500} placeholder="Note (e.g. Called, confirmed)" className="h-10 w-full min-w-0 rounded-lg border px-3 text-base sm:text-sm" />
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="approve" disabled={pending} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />} {retry ? "Apply again" : "Approve"}
        </button>
        {!retry ? (
          <button type="submit" name="decision" value="reject" disabled={pending} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-danger/40 bg-white px-4 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60">
            <X aria-hidden className="size-4" /> Reject
          </button>
        ) : null}
      </div>
      <FormNotice state={state} />
    </form>
  );
}
