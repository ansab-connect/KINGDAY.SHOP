import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Lock } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { GeneratePayrollForm, SalaryForm } from "@/components/admin/people/work-admin-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, getCurrentUser } from "@/features/auth/session";
import { monthLabel, type SalaryStructure } from "@/features/staff/work";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPaise } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Salary & Payroll" };

type TeamRow = { user_id: string; staff_code: string; full_name: string | null; designation: string | null; status: string };

async function PayrollContent() {
  if (!isSupabaseConfigured) return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Payroll needs Supabase.</p>;
  const me = await getCurrentUser();
  const canEdit = can(me, "payroll", "edit");
  const canCreate = can(me, "payroll", "create");
  const supabase = await createClient();
  const [team, structures, runs] = await Promise.all([
    supabase.rpc("payroll_staff_list"),
    supabase.from("salary_structures").select("user_id, basic_paise, allowances_paise, deductions_paise, effective_from, pay_note"),
    supabase.from("payroll_runs").select("id, period, status, finalized_at").order("period", { ascending: false }).limit(24),
  ]);
  if (team.error) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> Payroll isn&apos;t installed yet. Apply migration 20261117002300 in Supabase.
      </div>
    );
  }
  const members = (team.data ?? []) as TeamRow[];
  const byUser = new Map(
    ((structures.data ?? []) as SalaryStructure[]).map((s) => [
      s.user_id,
      { ...s, basic_paise: Number(s.basic_paise), allowances_paise: Number(s.allowances_paise), deductions_paise: Number(s.deductions_paise) },
    ]),
  );
  const runList = (runs.data ?? []) as { id: string; period: string; status: string; finalized_at: string | null }[];
  const thisMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);

  return (
    <>
      <PageHeader title="Salary & Payroll" description="Set each person's monthly salary, prepare the month's payroll, then finalise it so everyone sees their payslip." />
      <p className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock aria-hidden className="size-3.5" /> Staff see only their own salary and payslips. Every change is recorded in the audit log.
      </p>

      <Card className="mb-6 shadow-card">
        <CardHeader>
          <CardTitle>Monthly payroll</CardTitle>
          <CardDescription>Prepare creates a draft payslip for every active person with a salary. Review, then finalise.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {canCreate ? <GeneratePayrollForm defaultMonth={thisMonth} /> : null}
          {runList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payroll yet.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {runList.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/payroll/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <span className="flex-1 font-medium text-deep">{monthLabel(r.period)}</span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", r.status === "finalized" ? "bg-success-soft text-success" : "bg-gold-100 text-gold-800")}>
                      {r.status === "finalized" ? "Finalised" : "Draft"}
                    </span>
                    <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-3 font-heading text-lg font-semibold text-deep">Salaries</h2>
      {members.length === 0 ? <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">No staff accounts yet.</p> : null}
      <div className="flex flex-col gap-3">
        {members.map((m) => {
          const s = byUser.get(m.user_id) ?? null;
          const net = s ? s.basic_paise + s.allowances_paise - s.deductions_paise : 0;
          return (
            <details key={m.user_id} className="group rounded-xl border bg-white shadow-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words text-deep">{m.full_name ?? "Team member"}</span>
                  <span className="block text-xs text-muted-foreground">{[m.staff_code, m.designation, m.status === "inactive" ? "Inactive" : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={cn("text-sm font-semibold tabular", s ? "text-deep" : "text-muted-foreground")}>{s ? `${formatPaise(net)} / month` : "Not set"}</span>
                <ChevronRight aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-t px-4 py-4">
                {canEdit ? <SalaryForm userId={m.user_id} value={s} /> : <p className="text-sm text-muted-foreground">You can view salaries but not change them.</p>}
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}

export default function PayrollPage() {
  return (
    <StaffOnly module="payroll">
      <PayrollContent />
    </StaffOnly>
  );
}
