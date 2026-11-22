"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role=switch], [data-row-ignore]";

/**
 * A table row that opens `href` when clicked anywhere. Works in every browser (the CSS
 * "stretched link" trick breaks on iPhone Safari, where one row's link covered the whole
 * table). Links, buttons and switches inside the row keep their own click.
 */
export function ClickableRow({ href, className, children }: { href: string | null; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  if (!href) return <TableRow className={className}>{children}</TableRow>;
  return (
    <TableRow
      className={cn("cursor-pointer hover:bg-royal-50/40", className)}
      onMouseEnter={() => router.prefetch(href)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
        if (window.getSelection()?.toString()) return; // selecting text, not opening
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank", "noopener");
        else router.push(href);
      }}
    >
      {children}
    </TableRow>
  );
}
