import { Star } from "lucide-react";
import { discountPercent, formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Price({
  price,
  mrp,
  size = "md",
  className,
}: {
  price: number;
  mrp: number;
  size?: "md" | "lg";
  className?: string;
}) {
  const off = discountPercent(mrp, price);
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span className={cn("font-heading font-bold text-deep tabular", size === "lg" ? "text-3xl" : "text-base")}>
        {formatPaise(price)}
      </span>
      {off > 0 ? (
        <>
          <span className={cn("text-muted-foreground line-through tabular", size === "lg" ? "text-base" : "text-xs")}>
            <span className="sr-only">MRP </span>
            {formatPaise(mrp)}
          </span>
          <span className={cn("font-semibold text-success tabular", size === "lg" ? "text-base" : "text-xs")}>{off}% off</span>
        </>
      ) : null}
    </div>
  );
}

export function Rating({ value, count, className }: { value: number; count?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Star aria-hidden className="size-3.5 fill-gold text-gold" />
      <span className="font-semibold text-deep tabular">{value.toFixed(1)}</span>
      {count !== undefined ? <span className="tabular">({count})</span> : null}
      <span className="sr-only">out of 5 stars</span>
    </span>
  );
}

export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} role="img" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden className={cn("size-4", i < Math.round(value) ? "fill-gold text-gold" : "text-border")} />
      ))}
    </span>
  );
}
