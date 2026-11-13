import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  linkLabel = "View all",
  align = "left",
  tone = "light",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  align?: "left" | "center";
  tone?: "light" | "dark";
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 sm:mb-10", align === "center" ? "items-center text-center" : "sm:flex-row sm:items-end sm:justify-between")}>
      <div className={cn(align === "center" && "max-w-2xl")}>
        {eyebrow ? (
          <p className={cn("text-xs font-semibold tracking-[0.2em] uppercase", tone === "dark" ? "text-gold" : "text-gold-600")}>{eyebrow}</p>
        ) : null}
        <h2 className={cn("mt-2 text-2xl font-bold sm:text-[2rem] sm:leading-tight", tone === "dark" ? "text-white" : "text-deep")}>{title}</h2>
        {description ? (
          <p className={cn("mt-2 text-sm sm:text-base", tone === "dark" ? "text-white/70" : "text-muted-foreground")}>{description}</p>
        ) : null}
      </div>
      {href ? (
        <Link
          href={href}
          className={cn(
            "group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline",
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
