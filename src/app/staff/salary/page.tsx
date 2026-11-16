import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { Skeleton } from "@/components/ui/skeleton";
import { requireTeam } from "@/features/auth/session";
import { getMySalary, monthLabel } from "@/features/staff/work";
import { formatPaise } from "@/lib/format";

export const metadata: Metadata = { title: "My salary" };

async function Salary() {
  const user = await requireTeam();
  const { structure, payslips } = await getMySalary(user.id);
  const rows = structure
    ? [
        { en: "Basic", ml: "അടിസ്ഥാനം", v: structure.basic_paise },
        { en: "Allowances", ml: "അലവൻസ്", v: structure.allowances_paise },
        { en: "Deductions", ml: "കിഴിവ്", v: structure.deductions_paise },
        { en: "Net per month", ml: "പ്രതിമാസ അറ്റ ശമ്പളം", v: structure.basic_paise + structure.allowances_paise - structure.deductions_paise },
      ]
    : [];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-deep">
          <L en="My salary" ml="എന്റെ ശമ്പളം" />
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock aria-hidden className="size-3.5" /> <L en="Only you and payroll managers can see this." ml="നിങ്ങൾക്കും പേറോൾ മാനേജർമാർക്കും മാത്രം കാണാം." />
        </p>
      </div>

      <section className="rounded-2xl border bg-white p-5 shadow-card">
        <h2 className="font-semibold text-deep">
          <L en="Monthly salary" ml="പ്രതിമാസ ശമ്പളം" />
        </h2>
        {structure ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {rows.map((r) => (
              <div key={r.en} className="rounded-xl bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">
                  <L en={r.en} ml={r.ml} />
                </dt>
                <dd className="mt-0.5 font-heading text-lg font-bold break-words text-deep tabular">{formatPaise(r.v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            <L en="Your salary details haven't been added yet." ml="ശമ്പള വിവരങ്ങൾ ഇതുവരെ ചേർത്തിട്ടില്ല." />
          </p>
        )}
        {structure?.pay_note ? <p className="mt-3 text-sm text-muted-foreground">{structure.pay_note}</p> : null}
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-deep">
          <L en="Payslips" ml="പേസ്ലിപ്പുകൾ" />
        </h2>
        {payslips.length === 0 ? (
          <p className="rounded-2xl border bg-white p-6 text-center text-sm text-muted-foreground shadow-card">
            <L en="Payslips appear here once payroll is finalised." ml="പേറോൾ പൂർത്തിയായാൽ ഇവിടെ കാണാം." />
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-2xl border bg-white shadow-card">
            {payslips.map((p) => (
              <li key={p.id}>
                <Link href={`/staff/salary/${p.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/40">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-deep">{p.payroll_runs ? monthLabel(p.payroll_runs.period) : "Payslip"}</span>
                    <span className="block text-xs text-muted-foreground">{p.paid_on ? <L en="Paid" ml="നൽകി" /> : <L en="Not paid yet" ml="നൽകിയിട്ടില്ല" />}</span>
                  </span>
                  <span className="font-semibold text-deep tabular">{formatPaise(p.net_paise)}</span>
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function MySalaryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      }
    >
      <Salary />
    </Suspense>
  );
}
