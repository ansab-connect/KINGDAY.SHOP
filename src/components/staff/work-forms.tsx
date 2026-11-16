"use client";

import { useActionState } from "react";
import { CalendarDays, CheckCircle2, Loader2, Play, Printer } from "lucide-react";
import { FormNotice } from "@/components/forms/action-form";
import { L } from "@/components/i18n/lang";
import { updateMyTaskAction } from "@/features/staff/work-actions";
import type { FormState } from "@/features/forms";
import { cn } from "@/lib/utils";

type TaskView = {
  id: string;
  title: string;
  details: string | null;
  priority: "low" | "normal" | "high";
  due_date: string | null;
  status: "todo" | "in_progress" | "done" | "cancelled";
  staff_note: string | null;
  completed_at: string | null;
};

const STATUS_LABEL = {
  todo: { en: "To do", ml: "ചെയ്യാനുള്ളത്" },
  in_progress: { en: "In progress", ml: "നടക്കുന്നു" },
  done: { en: "Done", ml: "പൂർത്തിയായി" },
  cancelled: { en: "Cancelled", ml: "റദ്ദാക്കി" },
} as const;

const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** One task for the assignee: start it, add a note, mark it done. */
export function MyTaskCard({ task, today }: { task: TaskView; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateMyTaskAction, {});
  const overdue = task.due_date && task.due_date < today && (task.status === "todo" || task.status === "in_progress");
  const open = task.status === "todo" || task.status === "in_progress";

  return (
    <li className="rounded-2xl border bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 font-semibold break-words text-deep">{task.title}</h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            task.status === "done" ? "bg-success-soft text-success" : task.status === "in_progress" ? "bg-royal-50 text-royal" : task.status === "cancelled" ? "bg-muted text-muted-foreground" : "bg-gold-100 text-gold-800",
          )}
        >
          <L en={STATUS_LABEL[task.status].en} ml={STATUS_LABEL[task.status].ml} />
        </span>
      </div>
      {task.details ? <p className="mt-1.5 text-sm whitespace-pre-line text-muted-foreground">{task.details}</p> : null}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {task.due_date ? (
          <span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-danger")}>
            <CalendarDays aria-hidden className="size-3.5" />
            <L en={overdue ? `Overdue · ${fmtDate(task.due_date)}` : `Due ${fmtDate(task.due_date)}`} ml={overdue ? `വൈകി · ${fmtDate(task.due_date)}` : `അവസാന തീയതി ${fmtDate(task.due_date)}`} />
          </span>
        ) : null}
        {task.priority === "high" ? <span className="font-semibold text-danger"><L en="High priority" ml="അടിയന്തരം" /></span> : null}
        {task.completed_at ? <span><L en={`Completed ${fmtDate(task.completed_at)}`} ml={`പൂർത്തിയായത് ${fmtDate(task.completed_at)}`} /></span> : null}
      </p>

      {open ? (
        <form action={action} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="id" value={task.id} />
          <label className="sr-only" htmlFor={`note-${task.id}`}>Note</label>
          <textarea
            id={`note-${task.id}`}
            name="note"
            rows={2}
            maxLength={1000}
            defaultValue={task.staff_note ?? ""}
            placeholder="Add a note (optional)"
            className="w-full rounded-lg border px-3 py-2 text-base outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {task.status === "todo" ? (
              <button type="submit" name="status" value="in_progress" disabled={pending} className="inline-flex h-10 items-center gap-1.5 rounded-lg border bg-white px-4 text-sm font-semibold text-deep hover:bg-muted disabled:opacity-60">
                <Play aria-hidden className="size-4" /> <L en="Start" ml="തുടങ്ങുക" />
              </button>
            ) : null}
            <button type="submit" name="status" value="done" disabled={pending} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
              {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <CheckCircle2 aria-hidden className="size-4" />} <L en="Mark done" ml="പൂർത്തിയായി" />
            </button>
          </div>
          <FormNotice state={state} />
        </form>
      ) : task.staff_note ? (
        <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-deep">{task.staff_note}</p>
      ) : null}
    </li>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800 print:hidden">
      <Printer aria-hidden className="size-4" /> <L en="Print / Save as PDF" ml="പ്രിന്റ് / PDF" />
    </button>
  );
}
