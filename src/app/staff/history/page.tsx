import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardCheck, Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { Skeleton } from "@/components/ui/skeleton";
import { requireTeam } from "@/features/auth/session";
import { getWorkHistory } from "@/features/staff/work";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Work history" };

async function History() {
  const user = await requireTeam();
  const items = await getWorkHistory(user.id);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-deep">
          <L en="Work history" ml="ജോലി ചരിത്രം" />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <L en="Tasks and service jobs you have completed." ml="നിങ്ങൾ പൂർത്തിയാക്കിയ ജോലികൾ." />
        </p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border bg-white p-8 text-center text-sm text-muted-foreground shadow-card">
          <L en="Nothing completed yet." ml="ഇതുവരെ ഒന്നുമില്ല." />
        </p>
      ) : (
        <ol className="flex flex-col divide-y rounded-2xl border bg-white shadow-card">
          {items.map((i) => {
            const body = (
              <>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-royal-50 text-royal">
                  {i.kind === "service" ? <Wrench aria-hidden className="size-4" /> : <ClipboardCheck aria-hidden className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words text-deep">{i.title}</span>
                  {i.detail ? <span className="block text-sm break-words text-muted-foreground">{i.detail}</span> : null}
                  <span className="block text-xs text-muted-foreground">
                    {i.kind === "service" ? <L en="Service job" ml="സർവീസ്" /> : <L en="Task" ml="ജോലി" />} · {formatDateTime(new Date(i.at))}
                  </span>
                </span>
              </>
            );
            return (
              <li key={i.key}>
                {i.href ? (
                  <Link href={i.href} className="flex gap-3 p-4 hover:bg-muted/40">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-3 p-4">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default function WorkHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      }
    >
      <History />
    </Suspense>
  );
}
