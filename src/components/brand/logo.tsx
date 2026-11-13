import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** "light" for dark backgrounds (admin sidebar), "dark" for light backgrounds. */
  tone?: "light" | "dark";
  showTagline?: boolean;
};

/**
 * TEMPORARY typographic wordmark.
 * Replace with the official KING DAY logo file (public/brand/kingday-logo.svg)
 * once provided — the official logo must never be redrawn or distorted.
 */
export function Logo({ className, tone = "dark", showTagline = false }: LogoProps) {
  return (
    <span className={cn("inline-flex flex-col leading-none", className)} aria-label="KING DAY">
      <span
        className={cn(
          "font-heading text-xl font-extrabold tracking-[0.18em]",
          tone === "dark" ? "text-royal" : "text-white",
        )}
      >
        KING<span className="text-gold"> DAY</span>
      </span>
      {showTagline ? (
        <span
          className={cn(
            "mt-1 text-[0.6rem] font-medium tracking-[0.22em] uppercase",
            tone === "dark" ? "text-muted-foreground" : "text-white/60",
          )}
        >
          Every child deserves a royal ride
        </span>
      ) : null}
    </span>
  );
}
