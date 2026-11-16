"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, FieldError, FormNotice, TextField } from "@/components/forms/action-form";
import {
  createTaskAction,
  deleteDraftPayrollAction,
  finalizePayrollAction,
  generatePayrollAction,
  markPayslipPaidAction,
  savePayslipAction,
  saveSalaryStructureAction,
  setTaskStatusAction,
} from "@/features/staff/work-actions";
import type { FormState } from "@/features/forms";

const selectCls =
  "h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm";
const rupees = (paise: number) => (paise ? String(paise / 100) : "");
const money = { type: "number", min: 0, step: "0.01", inputMode: "decimal" as const };

export type TeamMember = { userId: string; label: string };

// ---------------------------------------------------------------- Tasks

export function TaskAssignForm({ team }: { team: TeamMember[] }) {
  return (
    <ActionForm action={createTaskAction} submitLabel="Assign task" resetOnSuccess>
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Task" name="title" state={state} required maxLength={160} placeholder="e.g. Recount jeep batteries" className="sm:col-span-2" />
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-deep">Details (optional)</span>
            <textarea name="details" rows={3} maxLength={2000} className="w-full rounded-lg border px-3 py-2 text-base outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-deep">Assign to</span>
            <select name="assignedTo" required defaultValue="" className={selectCls}>
              <option value="" disabled>Choose a team member</option>
              {team.map((m) => (
                <option key={m.userId} value={m.userId}>{m.label}</option>
              ))}
            </select>
            <FieldError state={state} name="assignedTo" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-deep">Priority</span>
              <select name="priority" defaultValue="normal" className={selectCls}>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </label>
            <TextField label="Due date" name="dueDate" type="date" state={state} />
          </div>
        </div>
      )}
    </ActionForm>
  );
}

export function TaskStatusControl({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setTaskStatusAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`st-${id}`}>Status</label>
      <select id={`st-${id}`} name="status" defaultValue={status} className="h-9 rounded-lg border bg-white px-2 text-sm">
        <option value="todo">To do</option>
        <option value="in_progress">In progress</option>
        <option value="done">Done</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <button type="submit" disabled={pending} className="h-9 rounded-lg border bg-white px-3 text-sm font-semibold text-deep hover:bg-muted disabled:opacity-60">
        Save
      </button>
      <FormNotice state={state} />
    </form>
  );
}

// ---------------------------------------------------------------- Salary

export function SalaryForm({
  userId,
  value,
}: {
  userId: string;
  value: { basic_paise: number; allowances_paise: number; deductions_paise: number; effective_from: string; pay_note: string | null } | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={saveSalaryStructureAction} submitLabel="Save salary">
      {(state) => (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <input type="hidden" name="userId" value={userId} />
          <TextField label="Basic (₹/month)" name="basic" state={state} defaultValue={rupees(value?.basic_paise ?? 0)} {...money} />
          <TextField label="Allowances (₹)" name="allowances" state={state} defaultValue={rupees(value?.allowances_paise ?? 0)} {...money} />
          <TextField label="Deductions (₹)" name="deductions" state={state} defaultValue={rupees(value?.deductions_paise ?? 0)} {...money} />
          <TextField label="From" name="effectiveFrom" type="date" required state={state} defaultValue={value?.effective_from ?? today} />
          <TextField label="Note (optional)" name="note" state={state} defaultValue={value?.pay_note ?? ""} maxLength={300} className="col-span-2 lg:col-span-4" />
        </div>
      )}
    </ActionForm>
  );
}

// ---------------------------------------------------------------- Payroll runs

export function GeneratePayrollForm({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(generatePayrollAction, {});
  useEffect(() => {
    if (state.ok && state.data?.runId) router.push(`/admin/payroll/${state.data.runId}`);
  }, [state, router]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-deep">Month</span>
        <input type="month" name="month" required defaultValue={defaultMonth} className={`${selectCls} w-48`} />
      </label>
      <button type="submit" disabled={pending} className="h-11 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
        {pending ? "Preparing…" : "Prepare payroll"}
      </button>
      <FormNotice state={state} />
    </form>
  );
}

export function PayslipEditForm({ slip }: { slip: { id: string; bonus_paise: number; deductions_paise: number; leave_deduction_paise: number; note: string | null } }) {
  return (
    <ActionForm action={savePayslipAction} submitLabel="Save" submitClassName="h-9">
      {(state) => (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input type="hidden" name="id" value={slip.id} />
          <TextField label="Bonus (₹)" name="bonus" state={state} defaultValue={rupees(slip.bonus_paise)} {...money} />
          <TextField label="Deductions (₹)" name="deductions" state={state} defaultValue={rupees(slip.deductions_paise)} {...money} />
          <TextField label="Leave / LOP (₹)" name="leave" state={state} defaultValue={rupees(slip.leave_deduction_paise)} {...money} />
          <TextField label="Note" name="note" state={state} defaultValue={slip.note ?? ""} maxLength={300} />
        </div>
      )}
    </ActionForm>
  );
}

export function FinalizePayrollButton({ runId }: { runId: string }) {
  return (
    <ActionForm
      action={finalizePayrollAction}
      submitLabel="Finalise payroll"
      pendingLabel="Finalising…"
      confirm="Finalise this payroll? Amounts get locked and every person can see their payslip."
    >
      <input type="hidden" name="runId" value={runId} />
    </ActionForm>
  );
}

export function DeleteDraftPayrollButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(deleteDraftPayrollAction, {});
  useEffect(() => {
    if (state.ok) router.push("/admin/payroll");
  }, [state, router]);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Delete this draft payroll and all its payslips?")) e.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="runId" value={runId} />
      <button type="submit" disabled={pending} className="h-10 rounded-lg border border-danger/40 bg-white px-4 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60">
        Delete draft
      </button>
      <FormNotice state={state} />
    </form>
  );
}

export function MarkPaidForm({ id, paidOn, method, paymentRef }: { id: string; paidOn: string | null; method: string | null; paymentRef: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={markPayslipPaidAction} submitLabel={paidOn ? "Update payment" : "Mark as paid"} submitClassName="h-9">
      {(state) => (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <input type="hidden" name="id" value={id} />
          <TextField label="Paid on" name="paidOn" type="date" required state={state} defaultValue={paidOn ?? today} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-deep">Method</span>
            <select name="method" defaultValue={method ?? "bank_transfer"} className={selectCls}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
            </select>
          </label>
          <TextField label="Reference" name="ref" state={state} defaultValue={paymentRef ?? ""} maxLength={80} className="col-span-2 sm:col-span-1" />
        </div>
      )}
    </ActionForm>
  );
}
