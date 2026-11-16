import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { History } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { MyTaskCard } from "@/components/staff/work-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { requireTeam } from "@/features/auth/session";
import { getMyTasks } from "@/features/staff/work";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My tasks" };

const TABS = [
  { key: "open", en: "Open", ml: "തുറന്നവ" },
  { key: "done", en: "Done", ml: "പൂർത്തിയായവ" },
] as const;

async function Tasks({ searchParams }: PageProps<"/staff/tasks">) {
  const user = await requireTeam();
  const tab = (await searchParams).tab === "done" ? "done" : "open";
  const tasks = await getMyTasks(user.id, tab);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-deep">
          <L en="My tasks" ml="എന്റെ ജോലികൾ" />
        </h1>
        <Link href="/staff/history" className="inline-flex items-center gap-1.5 text-sm font-semibold text-royal hover:underline">
          <History aria-hidden className="size-4" /> <L en="Work history" ml="ജോലി ചരിത്രം" />
        </Link>
      </div>
      <nav aria-label="Task filter" className="flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "open" ? "/staff/tasks" : "/staff/tasks?tab=done"}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", tab === t.key ? "bg-royal text-white" : "bg-white text-deep/75 ring-1 ring-border")}
          >
            <L en={t.en} ml={t.ml} />
          </Link>
        ))}
      </nav>
      {tasks.length === 0 ? (
        <p className="rounded-2xl border bg-white p-8 text-center text-sm text-muted-foreground shadow-card">
          {tab === "open" ? <L en="No open tasks. All caught up." ml="തുറന്ന ജോലികളില്ല." /> : <L en="No finished tasks yet." ml="പൂർത്തിയായ ജോലികളില്ല." />}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tasks.map((t) => (
            <MyTaskCard key={t.id} task={t} today={today} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MyTasksPage(props: PageProps<"/staff/tasks">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-8 w-40" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      }
    >
      <Tasks {...props} />
    </Suspense>
  );
}
