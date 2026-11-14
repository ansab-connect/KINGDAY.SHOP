"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { cancelServiceBookingAction } from "@/features/service/actions";

export function CancelBookingButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Cancel this service booking?")) return;
          start(async () => {
            const res = await cancelServiceBookingAction(id);
            if (res.ok) router.refresh();
            else setError(res.error ?? "Couldn't cancel.");
          });
        }}
        className="inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60"
      >
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        <L en="Cancel booking" ml="ബുക്കിംഗ് റദ്ദാക്കുക" />
      </button>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
