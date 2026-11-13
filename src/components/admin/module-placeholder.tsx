import type { LucideIcon } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Planned-module screen for admin sections whose backend arrives in a later phase. */
export function ModulePlaceholder({
  icon: Icon,
  phase,
  summary,
  features,
}: {
  icon: LucideIcon;
  phase: number;
  summary: string;
  features: string[];
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="flex flex-col gap-8 p-6 sm:p-10 md:flex-row">
        <div className="md:w-72">
          <span className="grid size-12 place-items-center rounded-xl bg-royal text-gold">
            <Icon aria-hidden className="size-6" />
          </span>
          <p className="mt-5 text-xs font-semibold tracking-[0.16em] text-gold-600 uppercase">
            Scheduled · Phase {phase}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{summary}</p>
        </div>
        <ul className="grid flex-1 gap-3 sm:grid-cols-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-royal-400" />
              {f}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
