import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { DeleteDraftPayrollButton, FinalizePayrollButton, MarkPaidForm, PayslipEditForm } from "@/components/admin/people/work-admin-forms";
import { Card, CardContent } from "@/components/ui/card";
import { can, getCurrentUser } from "@/features/auth/session";
import { getRunPayslips, monthLabel } from "@/features/staff/work";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPaise } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payroll" };

async function RunContent({ params }: PageProps<"/admin/payroll/[id]">) {
  const { id } = await params;
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await getCurrentUser();
  const supabase = await createClient();
  const { data: run } = await supabase.from("payroll_runs").select("id, period, status, finalized_at").eq("id", id).maybeSingle();
  if (!run) notFound();
  const r = run as { id: string; period: string; status: string; finalized_at: string | null };
  const slips = await getRunPayslips(id);
  const draft = r.status === "draft";
  const total = slips.reduce((n, s) => n + s.net_paise, 0);
  const paid = slips.filter((s) => s.paid_on).length;

  return (
    <>
      <Link href="/admin/payroll" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Salary &amp; Payroll
      </Link>
      <PageHeader
        title={`Payroll · ${monthLabel(r.period)}`}
        description={
          draft
            ? "Draft: adjust bonus, deductions and leave, then finalise. Staff can't see it yet."
            : `Finalised. Amounts are locked; ${paid} of ${slips.length} marked paid.`
        }
        actions={draft && can(me, "payroll", "delete") ? <DeleteDraftPayrollButton runId={r.id} /> : null}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-card">
          <p className="text-xs text-muted-foreground">People</p>
          <p className="font-heading text-xl font-bold text-deep tabular">{slips.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-card">
          <p className="text-xs text-muted-foreground">Total net pay</p>
          <p className="font-heading text-xl font-bold break-words text-deep tabular">{formatPaise(total)}</p>
        </div>
        <div className="col-span-2 rounded-xl border bg-white p-4 shadow-card sm:col-span-1">
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="font-heading text-xl font-bold text-deep">{draft ? "Draft" : "Finalised"}</p>
        </div>
      </div>

      {slips.length === 0 ? (
        <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
          No payslips. Set salaries on the Salary &amp; Payroll page, then prepare this month again.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {slips.map((s) => (
          <Card key={s.id} className="shadow-card">
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold break-words text-deep">{s.staff_name ?? "Team member"}</p>
                  <p className="text-xs text-muted-foreground">{[s.staff_code, s.designation].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="font-heading text-lg font-bold text-deep tabular">{formatPaise(s.net_paise)}</p>
                  <p className="text-xs text-muted-foreground">
                    Basic {formatPaise(s.basic_paise)} + allowances {formatPaise(s.allowances_paise)}
                  </p>
                  {s.paid_on ? (
                    <p className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                      <CheckCircle2 aria-hidden className="size-3.5" /> Paid {s.paid_on}
                    </p>
                  ) : null}
                </div>
              </div>
              {can(me, "payroll", "edit") ? (
                draft ? (
                  <PayslipEditForm slip={s} />
                ) : (
                  <MarkPaidForm id={s.id} paidOn={s.paid_on} method={s.payment_method} paymentRef={s.payment_ref} />
                )
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {draft && slips.length > 0 && can(me, "payroll", "approve") ? (
        <Card className="mt-6 border-royal/30 shadow-card">
          <CardContent>
            <FinalizePayrollButton runId={r.id} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

export default function PayrollRunPage(props: PageProps<"/admin/payroll/[id]">) {
  return (
    <StaffOnly module="payroll">
      <RunContent {...props} />
    </StaffOnly>
  );
}
