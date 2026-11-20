import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { cn } from "@/lib/utils";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  linkLabel = <L en="View all" ml="എല്ലാം കാണുക" />,
  align = "left",
  tone = "light",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  href?: string;
  linkLabel?: React.ReactNode;
  align?: "left" | "center";
  tone?: "light" | "dark";
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:mb-7", align === "center" ? "items-center text-center" : "flex-row items-end justify-between")}>
      <div className={cn(align === "center" && "max-w-2xl")}>
        {eyebrow ? (
          <p className={cn("text-[0.7rem] font-semibold tracking-[0.18em] uppercase", tone === "dark" ? "text-gold" : "text-gold-600")}>{eyebrow}</p>
        ) : null}
        <h2 className={cn("mt-1 text-xl font-bold tracking-tight sm:text-[1.75rem] sm:leading-tight", tone === "dark" ? "text-white" : "text-deep")}>{title}</h2>
        {description ? (
          <p className={cn("mt-1.5 hidden text-sm sm:block", tone === "dark" ? "text-white/70" : "text-muted-foreground")}>{description}</p>
        ) : null}
      </div>
      {href ? (
        <Link
          href={href}
          className={cn(
            "group inline-flex shrink-0 items-center gap-1 pb-1 text-sm font-semibold underline-offset-4 hover:underline",
            tone === "dark" ? "text-gold" : "text-royal",
          )}
        >
          {linkLabel}
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}
