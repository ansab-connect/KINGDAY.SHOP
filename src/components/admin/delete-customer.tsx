"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { FormNotice } from "@/components/forms/action-form";
import { deleteCustomerAction } from "@/features/admin/actions";
import type { FormState } from "@/features/forms";

/**
 * Two-step delete: open the panel, then type the customer ID to confirm.
 * The server re-checks permission, staff status and open orders.
 */
export function DeleteCustomerButton({ userId, code, name }: { userId: string; code: string | null; name: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(deleteCustomerAction, {});
  const expected = (code ?? "DELETE").toUpperCase();

  if (state.ok) return <FormNotice state={state} />;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${name}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/30 px-2.5 text-xs font-semibold text-danger hover:bg-danger-soft"
      >
        <Trash2 aria-hidden className="size-3.5" /> Delete
      </button>
    );
  }

  return (
    <form action={action} className="flex w-64 max-w-full flex-col gap-2 rounded-xl border border-danger/30 bg-danger-soft/40 p-3 text-left">
      <input type="hidden" name="userId" value={userId} />
      <p className="flex items-start gap-1.5 text-xs text-danger">
        <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Permanently deletes <strong>{name}</strong>&apos;s account, addresses, cart and wishlist. Their orders are kept. This can&apos;t be undone.
        </span>
      </p>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-deep">
          Type <strong className="font-mono">{expected}</strong> to confirm
        </span>
        <input
          name="confirmCode"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="h-9 rounded-lg border bg-white px-2 font-mono text-base uppercase outline-none focus-visible:border-danger sm:text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || typed.trim().toUpperCase() !== expected}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Trash2 aria-hidden className="size-3.5" />}
          Delete permanently
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
          aria-label="Cancel"
          className="grid size-8 place-items-center rounded-lg border bg-white text-deep hover:bg-muted"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
      <FormNotice state={state} />
    </form>
  );
}
