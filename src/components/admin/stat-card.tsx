import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Percentage change vs previous period. */
  change?: number;
  hint?: string;
  tone?: "royal" | "gold" | "neutral" | "warning";
};

const toneStyles = {
  royal: "bg-royal-50 text-royal",
  gold: "bg-gold-50 text-gold-700",
  neutral: "bg-muted text-deep",
  warning: "bg-warning-soft text-warning",
} as const;

export function StatCard({ label, value, icon: Icon, change, hint, tone = "royal" }: StatCardProps) {
  const up = (change ?? 0) >= 0;
  return (
    <Card className="gap-0 py-0 shadow-card transition-shadow duration-300 hover:shadow-lift">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span className={cn("grid size-9 place-items-center rounded-lg", toneStyles[tone])}>
            <Icon aria-hidden className="size-[18px]" />
          </span>
        </div>
        <p className="mt-3 font-heading text-2xl font-bold text-deep tabular sm:text-[1.7rem]">{value}</p>
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {change !== undefined ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular",
                up ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
              )}
            >
              {up ? <ArrowUpRight aria-hidden className="size-3" /> : <ArrowDownRight aria-hidden className="size-3" />}
              {formatPercent(change)}
            </span>
          ) : null}
          {hint ? <span className="text-muted-foreground">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
