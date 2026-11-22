"use client";

import { Printer } from "lucide-react";

/** Opens the browser's print dialog (choose "Save as PDF" to download). */
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800">
      <Printer aria-hidden className="size-4" /> {label}
    </button>
  );
}
