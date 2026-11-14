import { CheckCircle2, Circle } from "lucide-react";
import { statusLabel } from "@/features/service/constants";
import type { getInspection, JobEvent } from "@/features/service/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Status timeline: who did what, when (staff ID, date/time, note). */
export function JobTimeline({ events, names = {} }: { events: JobEvent[]; names?: Record<string, string> }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">No updates yet.</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l-2 border-royal-100 pl-5">
      {events.map((e, i) => {
        const last = i === events.length - 1;
        const who = e.actor_code ?? (e.actor_id ? names[e.actor_id] : null) ?? (e.status === "new" || e.status === "cancelled" ? "Customer" : "System");
        return (
          <li key={e.id} className="relative">
            <span className={cn("absolute top-0.5 -left-[1.72rem] grid size-5 place-items-center rounded-full bg-white", last ? "text-royal" : "text-royal-300")}>
              {last ? <CheckCircle2 className="size-5" /> : <Circle className="size-4 fill-current" />}
            </span>
            <p className={cn("text-sm font-semibold", last ? "text-deep" : "text-deep/80")}>{statusLabel(e.status)}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(new Date(e.created_at))} · {who}
            </p>
            {e.note ? <p className="mt-1 rounded-lg bg-muted/60 px-3 py-2 text-sm text-deep">{e.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

type InspectionData = NonNullable<Awaited<ReturnType<typeof getInspection>>>;

function Photos({ title, list }: { title: string; list: { path: string; url: string | null }[] }) {
  if (!list.length) return null;
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {list.map((p, i) =>
          p.url ? (
            <a key={p.path} href={p.url} target="_blank" rel="noopener noreferrer" className="block size-24 overflow-hidden rounded-xl border">
              {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
              <img src={p.url} alt={`${title} ${i + 1}`} className="size-full object-cover" />
            </a>
          ) : null,
        )}
      </div>
    </div>
  );
}

export function InspectionView({ data }: { data: InspectionData | null }) {
  if (!data) return <p className="text-sm text-muted-foreground">The technician hasn&apos;t filled the report yet.</p>;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ["Problem found", data.problem_found],
          ["Work performed", data.work_performed],
          ["Spare parts required", data.spare_parts],
          ["Notes", data.notes],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="whitespace-pre-line text-deep">{v || "—"}</dd>
          </div>
        ))}
      </dl>
      <Photos title="Before" list={data.before} />
      <Photos title="After" list={data.after} />
      {data.confirmed_by || data.signature?.url ? (
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground">Customer confirmation</p>
          <p className="font-semibold text-deep">{data.confirmed_by ?? "—"}</p>
          {data.signature?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URL
            <img src={data.signature.url} alt="Customer signature" className="mt-2 h-24 rounded-lg border bg-white" />
          ) : null}
          {data.confirmed_at ? <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(new Date(data.confirmed_at))}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
