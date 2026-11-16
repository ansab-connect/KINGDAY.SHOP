"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { L } from "@/components/i18n/lang";
import { addCustomItemAction, removeCustomItemAction, searchSparePartsAction, setReplacedPartAction, type PartHit } from "@/features/service/parts-actions";
import { cn } from "@/lib/utils";

export type ReplacedLine = {
  id: string;
  partId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  approval: "pending" | "approved" | "rejected";
  stock?: number | null;
};

const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Replaced Items for one booking: search the master list, tap to add, change quantity,
 * or add a custom item (waits for office approval). Stock and bill update automatically.
 */
export function ReplacedItems({ bookingId, lines, editable }: { bookingId: string; lines: ReplacedLine[]; editable: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PartHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState({ open: false, name: "", qty: "1", price: "", master: false });

  useEffect(() => {
    if (!editable) return;
    let alive = true;
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await searchSparePartsAction(q);
      if (alive) {
        setHits(res);
        setSearching(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, editable]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Couldn't update.");
      else {
        after?.();
        router.refresh();
      }
    });

  const total = lines.filter((l) => l.approval === "approved").reduce((n, l) => n + l.quantity * l.unitPrice, 0);
  const inBill = new Map(lines.filter((l) => l.partId).map((l) => [l.partId!, l.quantity]));

  return (
    <div className="flex flex-col gap-4">
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground"><L en="No parts replaced yet." ml="ഇതുവരെ പാർട്ടുകൾ മാറ്റിയിട്ടില്ല." /></p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 p-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium break-words text-deep">{l.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {rupees(l.unitPrice)} each
                  {l.partId ? null : l.approval === "pending" ? " · waiting for office approval" : l.approval === "rejected" ? " · rejected (not billed)" : " · approved"}
                </span>
              </span>
              {editable && l.partId ? (
                <span className="flex items-center rounded-full border">
                  <button type="button" disabled={pending} aria-label={`Fewer ${l.name}`} onClick={() => run(() => setReplacedPartAction({ bookingId, partId: l.partId!, quantity: l.quantity - 1 }))} className="grid size-9 place-items-center rounded-full hover:bg-muted">
                    {l.quantity === 1 ? <Trash2 className="size-4 text-danger" /> : <Minus className="size-4" />}
                  </button>
                  <span className="w-7 text-center text-sm font-semibold tabular">{l.quantity}</span>
                  <button type="button" disabled={pending} aria-label={`More ${l.name}`} onClick={() => run(() => setReplacedPartAction({ bookingId, partId: l.partId!, quantity: l.quantity + 1 }))} className="grid size-9 place-items-center rounded-full hover:bg-muted">
                    <Plus className="size-4" />
                  </button>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground tabular">× {l.quantity}</span>
              )}
              <span className={cn("w-20 text-right text-sm font-semibold tabular", l.approval === "rejected" && "text-muted-foreground line-through")}>{rupees(l.quantity * l.unitPrice)}</span>
              {editable && !l.partId ? (
                <button type="button" disabled={pending} aria-label={`Remove ${l.name}`} onClick={() => run(() => removeCustomItemAction(l.id))} className="grid size-9 place-items-center rounded-lg text-danger hover:bg-danger-soft">
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
          <li className="flex justify-between p-3 text-sm font-semibold">
            <span className="text-deep"><L en="Spare parts on the bill" ml="ബില്ലിലെ സ്പെയർ പാർട്സ്" /></span>
            <span className="text-royal tabular">{rupees(total)}</span>
          </li>
        </ul>
      )}

      {editable ? (
        <>
          <label className="relative block">
            <span className="sr-only">Search spare parts</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parts (name, SKU, model)" className={cn(inputClass, "pl-9")} />
            {searching ? <Loader2 aria-hidden className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
          </label>
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {hits.map((h) => {
              const qty = inBill.get(h.id) ?? 0;
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    disabled={pending || h.stock <= 0}
                    onClick={() => run(() => setReplacedPartAction({ bookingId, partId: h.id, quantity: qty + 1 }))}
                    className="flex w-full items-center gap-3 rounded-lg border bg-white px-3 py-2 text-left hover:border-royal/40 disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium break-words text-deep">{h.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {h.sku} · {h.stock > 0 ? `${h.stock} in stock` : "out of stock"}
                        {qty ? ` · ${qty} on this bill` : ""}
                      </span>
                    </span>
                    <span className="text-sm font-semibold tabular">{rupees(h.selling_price_paise)}</span>
                    <Plus aria-hidden className="size-4 text-royal" />
                  </button>
                </li>
              );
            })}
            {!searching && hits.length === 0 ? <li className="text-sm text-muted-foreground">No matching parts.</li> : null}
          </ul>

          {custom.open ? (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
              <p className="text-sm font-semibold text-deep"><L en="Add new item (not in the list)" ml="പുതിയ ഇനം ചേർക്കുക" /></p>
              <div className="grid grid-cols-[1fr_4rem_6rem] gap-2">
                <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} maxLength={120} placeholder="Item name" aria-label="Custom item name" className={inputClass} />
                <input value={custom.qty} onChange={(e) => setCustom({ ...custom, qty: e.target.value })} inputMode="numeric" aria-label="Quantity" className={cn(inputClass, "text-center")} />
                <input value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} inputMode="decimal" placeholder="₹ each" aria-label="Price each" className={inputClass} />
              </div>
              <label className="flex items-center gap-2 text-sm text-deep">
                <input type="checkbox" checked={custom.master} onChange={(e) => setCustom({ ...custom, master: e.target.checked })} className="size-4 accent-[#4B0082]" />
                <L en="Ask the office to add it to the master list" ml="മാസ്റ്റർ ലിസ്റ്റിൽ ചേർക്കാൻ ആവശ്യപ്പെടുക" />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        addCustomItemAction({
                          bookingId,
                          name: custom.name,
                          quantity: Math.trunc(Number(custom.qty) || 0),
                          pricePaise: Math.round((Number(custom.price) || 0) * 100),
                          requestMaster: custom.master,
                        }),
                      () => setCustom({ open: false, name: "", qty: "1", price: "", master: false }),
                    )
                  }
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60"
                >
                  <L en="Add to bill" ml="ബില്ലിൽ ചേർക്കുക" />
                </button>
                <button type="button" onClick={() => setCustom({ ...custom, open: false })} className="h-10 rounded-lg border px-4 text-sm font-semibold text-deep hover:bg-muted">
                  <L en="Cancel" ml="റദ്ദാക്കുക" />
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setCustom({ ...custom, open: true })} className="inline-flex h-10 w-fit items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold text-deep hover:bg-muted">
              <PackagePlus aria-hidden className="size-4" /> <L en="Add new item" ml="പുതിയ ഇനം" />
            </button>
          )}
        </>
      ) : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
