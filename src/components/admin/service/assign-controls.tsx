"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { FormNotice } from "@/components/forms/action-form";
import { assignJobAction, cancelJobAction } from "@/features/service/job-actions";
import type { FormState } from "@/features/forms";
import { cn } from "@/lib/utils";

type Tech = { user_id: string; full_name: string | null; staff_code: string | null; open_jobs: number };

export function AssignJobForm({ bookingId, technicians, currentId, locked }: { bookingId: string; technicians: Tech[]; currentId: string | null; locked: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(assignJobAction, {});
  if (!technicians.length) {
    return <p className="text-sm text-muted-foreground">No active Service Staff yet. Create one in Users &amp; Roles (role: Service Staff).</p>;
  }
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (locked && !window.confirm("The technician has already accepted this job. Reassign it anyway?")) e.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
        Technician
        <select name="staffId" defaultValue={currentId ?? ""} required className={inputClass}>
          <option value="">Choose…</option>
          {technicians.map((t) => (
            <option key={t.user_id} value={t.user_id}>
              {[t.staff_code, t.full_name].filter(Boolean).join(" · ")} — {t.open_jobs} open
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
        Note for the technician (optional)
        <input name="note" maxLength={1000} className={inputClass} placeholder="e.g. Call before visiting" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {currentId ? "Reassign" : "Assign"}
        </button>
        <FormNotice state={state} />
      </div>
    </form>
  );
}

export function CancelJobForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(cancelJobAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Cancel this service job?")) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input name="note" required minLength={3} maxLength={1000} placeholder="Reason (shown in the timeline)" className={cn(inputClass)} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg border border-danger/40 px-4 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          Cancel job
        </button>
        <FormNotice state={state} />
      </div>
    </form>
  );
}
