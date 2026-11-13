"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { ActionResult } from "@/features/catalog/admin-actions";

/** Two-step delete: the first click arms it, the second confirms. */
export function DeleteButton({
  label,
  onDelete,
  redirectTo,
}: {
  label: string;
  onDelete: () => Promise<ActionResult>;
  redirectTo: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!armed) return setArmed(true);
            start(async () => {
              const r = await onDelete();
              if (r.ok) router.push(redirectTo);
              else {
                setError(r.error);
                setArmed(false);
              }
            });
          }}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
        >
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Trash2 aria-hidden className="size-4" />}
          {armed ? `Confirm delete ${label}` : `Delete ${label}`}
        </button>
        {armed && !pending ? (
          <button type="button" onClick={() => setArmed(false)} className="h-10 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted">
            Cancel
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
