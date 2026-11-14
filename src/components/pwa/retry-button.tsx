"use client";

import { RotateCw } from "lucide-react";

export function RetryButton() {
  return (
    <button type="button" onClick={() => window.location.reload()} className="inline-flex h-12 items-center gap-2 rounded-full bg-gold px-6 text-sm font-bold text-deep hover:bg-gold-300">
      <RotateCw aria-hidden className="size-4" /> Try again
    </button>
  );
}
