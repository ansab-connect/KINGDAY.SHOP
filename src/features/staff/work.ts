import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Tasks, work history, salary and payslips. Every query runs as the signed-in user,
 * so RLS (migration 0023) limits staff to their own rows; managers need the
 * "staff" (tasks) or "payroll" (salary) permission to see others.
 */

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export const TASK_STATUS: Record<TaskStatus, { en: string; ml: string }> = {
  todo: { en: "To do", ml: "ചെയ്യാനുള്ളത്" },
  in_progress: { en: "In progress", ml: "നടക്കുന്നു" },
  done: { en: "Done", ml: "പൂർത്തിയായി" },
  cancelled: { en: "Cancelled", ml: "റദ്ദാക്കി" },
};
export const PRIORITY: Record<string, { en: string; ml: string }> = {
  high: { en: "High", ml: "ഉയർന്നത്" },
  normal: { en: "Normal", ml: "സാധാരണ" },
  low: { en: "Low", ml: "കുറഞ്ഞത്" },
};

export type Task = {
  id: string;
  title: string;
  details: string | null;
  assigned_to: string;
  priority: "low" | "normal" | "high";
  due_date: string | null;
  status: TaskStatus;
  staff_note: string | null;
  completed_at: string | null;
  created_at: string;
};
const TASK_COLS = "id, title, details, assigned_to, priority, due_date, status, staff_note, completed_at, created_at";

export async function getMyTasks(userId: string, tab: "open" | "done"): Promise<Task[]> {
  const supabase = await createClient();
  let q = supabase.from("staff_tasks").select(TASK_COLS).eq("assigned_to", userId);
  q = tab === "open" ? q.in("status", ["todo", "in_progress"]).order("due_date", { ascending: true, nullsFirst: false }) : q.in("status", ["done", "cancelled"]).order("updated_at", { ascending: false });
  const { data } = await q.limit(200);
  return (data ?? []) as Task[];
}

export async function countMyOpenTasks(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("staff_tasks").select("id", { count: "exact", head: true }).eq("assigned_to", userId).in("status", ["todo", "in_progress"]);
  return count ?? 0;
}

export type HistoryItem = { key: string; kind: "task" | "service"; title: string; detail: string | null; at: string; href?: string };

/** Completed tasks and completed service jobs, newest first. */
export async function getWorkHistory(userId: string): Promise<HistoryItem[]> {
  const supabase = await createClient();
  const [tasks, jobs] = await Promise.all([
    supabase.from("staff_tasks").select("id, title, staff_note, completed_at").eq("assigned_to", userId).eq("status", "done").order("completed_at", { ascending: false }).limit(100),
    supabase.from("service_bookings").select("id, booking_code, product_name, completed_at").eq("assigned_to", userId).in("status", ["completed", "invoiced"]).order("completed_at", { ascending: false }).limit(100),
  ]);
  const items: HistoryItem[] = [
    ...((tasks.data ?? []) as { id: string; title: string; staff_note: string | null; completed_at: string | null }[]).map((t) => ({
      key: `t-${t.id}`,
      kind: "task" as const,
      title: t.title,
      detail: t.staff_note,
      at: t.completed_at ?? "",
    })),
    ...((jobs.data ?? []) as { id: string; booking_code: string; product_name: string | null; completed_at: string | null }[]).map((j) => ({
      key: `s-${j.id}`,
      kind: "service" as const,
      title: `${j.booking_code}${j.product_name ? ` · ${j.product_name}` : ""}`,
      detail: null,
      at: j.completed_at ?? "",
      href: `/staff/jobs/${j.id}`,
    })),
  ];
  return items.filter((i) => i.at).sort((a, b) => b.at.localeCompare(a.at));
}

export type SalaryStructure = {
  user_id: string;
  basic_paise: number;
  allowances_paise: number;
  deductions_paise: number;
  effective_from: string;
  pay_note: string | null;
};

export type Payslip = {
  id: string;
  run_id: string;
  user_id: string;
  staff_code: string | null;
  staff_name: string | null;
  designation: string | null;
  basic_paise: number;
  allowances_paise: number;
  bonus_paise: number;
  deductions_paise: number;
  leave_deduction_paise: number;
  net_paise: number;
  note: string | null;
  paid_on: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  payroll_runs: { period: string; status: string } | null;
};
const SLIP_COLS =
  "id, run_id, user_id, staff_code, staff_name, designation, basic_paise, allowances_paise, bonus_paise, deductions_paise, leave_deduction_paise, net_paise, note, paid_on, payment_method, payment_ref, payroll_runs(period, status)";

const num = (v: unknown) => Number(v ?? 0);
function normalizeSlip(r: Record<string, unknown>): Payslip {
  return {
    ...(r as unknown as Payslip),
    basic_paise: num(r.basic_paise),
    allowances_paise: num(r.allowances_paise),
    bonus_paise: num(r.bonus_paise),
    deductions_paise: num(r.deductions_paise),
    leave_deduction_paise: num(r.leave_deduction_paise),
    net_paise: num(r.net_paise),
  };
}

export async function getMySalary(userId: string): Promise<{ structure: SalaryStructure | null; payslips: Payslip[] }> {
  const supabase = await createClient();
  const [s, p] = await Promise.all([
    supabase.from("salary_structures").select("user_id, basic_paise, allowances_paise, deductions_paise, effective_from, pay_note").eq("user_id", userId).maybeSingle(),
    supabase.from("payslips").select(SLIP_COLS).eq("user_id", userId).order("created_at", { ascending: false }).limit(60),
  ]);
  const structure = s.data
    ? { ...(s.data as SalaryStructure), basic_paise: num(s.data.basic_paise), allowances_paise: num(s.data.allowances_paise), deductions_paise: num(s.data.deductions_paise) }
    : null;
  return { structure, payslips: ((p.data ?? []) as Record<string, unknown>[]).map(normalizeSlip) };
}

/** One payslip; RLS returns it only to its owner (finalised runs) or payroll managers. */
export async function getPayslip(id: string): Promise<Payslip | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("payslips").select(SLIP_COLS).eq("id", id).maybeSingle();
  return data ? normalizeSlip(data as Record<string, unknown>) : null;
}

export async function getRunPayslips(runId: string): Promise<Payslip[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("payslips").select(SLIP_COLS).eq("run_id", runId).order("staff_code");
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeSlip);
}

export const monthLabel = (period: string) => new Date(`${period}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
] as const;
