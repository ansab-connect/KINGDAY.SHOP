import { Logo } from "@/components/brand/logo";
import { siteConfig } from "@/config/site";
import { monthLabel, PAYMENT_METHODS, type Payslip } from "@/features/staff/work";
import { formatPaise } from "@/lib/format";

/** Printable payslip (staff portal and payroll admin share this). */
export function PayslipView({ slip }: { slip: Payslip }) {
  const period = slip.payroll_runs?.period;
  const earnings = [
    ["Basic", slip.basic_paise],
    ["Allowances", slip.allowances_paise],
    ["Bonus", slip.bonus_paise],
  ] as const;
  const deductions = [
    ["Deductions", slip.deductions_paise],
    ["Leave / loss of pay", slip.leave_deduction_paise],
  ] as const;
  const gross = slip.basic_paise + slip.allowances_paise + slip.bonus_paise;
  const totalDeductions = slip.deductions_paise + slip.leave_deduction_paise;
  const method = PAYMENT_METHODS.find((m) => m.value === slip.payment_method)?.label;

  return (
    <article className="rounded-2xl border bg-white p-5 shadow-card sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Logo />
          <p className="mt-1 text-xs text-muted-foreground">{siteConfig.company}</p>
        </div>
        <div className="sm:text-right">
          <p className="font-heading text-lg font-bold text-deep">Payslip</p>
          <p className="text-sm text-muted-foreground">{period ? monthLabel(period) : ""}</p>
        </div>
      </header>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 py-4 text-sm sm:grid-cols-2">
        {[
          ["Name", slip.staff_name ?? "—"],
          ["Staff ID", slip.staff_code ?? "—"],
          ["Designation", slip.designation ?? "—"],
          ["Status", slip.paid_on ? `Paid on ${new Date(`${slip.paid_on}T00:00:00`).toLocaleDateString("en-IN")}${method ? ` · ${method}` : ""}` : "Not paid yet"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 sm:block">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium break-words text-deep">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h2 className="mb-2 text-sm font-semibold text-deep">Earnings</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {earnings.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="tabular">{formatPaise(v)}</span></li>
            ))}
            <li className="mt-1 flex justify-between gap-3 border-t pt-2 font-semibold"><span>Gross</span><span className="tabular">{formatPaise(gross)}</span></li>
          </ul>
        </section>
        <section className="rounded-xl border p-4">
          <h2 className="mb-2 text-sm font-semibold text-deep">Deductions</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {deductions.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="tabular">{formatPaise(v)}</span></li>
            ))}
            <li className="mt-1 flex justify-between gap-3 border-t pt-2 font-semibold"><span>Total</span><span className="tabular">{formatPaise(totalDeductions)}</span></li>
          </ul>
        </section>
      </div>

      <p className="mt-4 flex items-center justify-between rounded-xl bg-deep px-4 py-3 text-white">
        <span className="text-sm font-semibold">Net pay</span>
        <span className="font-heading text-xl font-bold text-gold tabular">{formatPaise(slip.net_paise)}</span>
      </p>
      {slip.note ? <p className="mt-3 text-sm text-muted-foreground">Note: {slip.note}</p> : null}
      <p className="mt-6 text-xs text-muted-foreground">This is a computer-generated payslip.</p>
    </article>
  );
}
