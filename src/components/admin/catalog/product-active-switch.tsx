"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setProductActive } from "@/features/catalog/admin-actions";
import { cn } from "@/lib/utils";

/** Active / Inactive switch for one product, right in the products list. */
export function ProductActiveSwitch({ id, name, active, disabled = false }: { id: string; name: string; active: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [on, setOn] = useOptimistic(active);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${name}: ${on ? "Active" : "Inactive"}`}
        disabled={disabled || pending}
        title={on ? "Live on the store. Click to hide." : "Hidden from the store. Click to make it live."}
        onClick={() =>
          start(async () => {
            setError(null);
            setOn(!on);
            const r = await setProductActive(id, !on);
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border px-1 pr-2.5 text-xs font-semibold transition-colors disabled:opacity-60",
          on ? "border-success/30 bg-success-soft text-success" : "border-border bg-muted text-muted-foreground",
        )}
      >
        <span className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-success" : "bg-muted-foreground/40")}>
          <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform", on && "translate-x-4")} />
        </span>
        {on ? "Active" : "Inactive"}
      </button>
      {error ? <span className="max-w-40 text-[0.7rem] text-danger">{error}</span> : null}
    </span>
  );
}
