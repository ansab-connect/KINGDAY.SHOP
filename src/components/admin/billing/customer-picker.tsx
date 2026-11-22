"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, MapPin, Phone, Search, UserPlus, UserRound, X } from "lucide-react";
import { createBillCustomerAction, nextCustomerCodeAction, searchBillCustomersAction, type BillCustomerHit } from "@/features/billing/actions";
import { cn } from "@/lib/utils";

export type BillCustomer = { id: string | null; code: string | null; name: string; phone: string; address: string; addresses: string[] };
export const EMPTY_CUSTOMER: BillCustomer = { id: null, code: null, name: "", phone: "", address: "", addresses: [] };

const inputCls = "h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100";

/**
 * Step 2 of a bill: find the customer by Customer ID or mobile (both unique). If nobody
 * matches, offer the next Customer ID and create the customer. The address is optional:
 * just a town is fine. The last one used comes back automatically next time.
 */
export function CustomerPicker({ value, onChange }: { value: BillCustomer; onChange: (c: BillCustomer) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<BillCustomerHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextCode, setNextCode] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", mobile: "", address: "" });
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [creating, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (!looksValid(term)) return;
    const id = ++seq.current;
    const t = window.setTimeout(async () => {
      setBusy(true);
      const r = await searchBillCustomersAction(term);
      if (id !== seq.current) return;
      setHits(r);
      setBusy(false);
      if (!r.length) {
        setNextCode(await nextCustomerCodeAction());
        const digits = term.replace(/\D/g, "");
        setDraft((d) => ({ ...d, mobile: digits.length >= 10 ? digits.slice(-10) : d.mobile }));
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const pick = (h: BillCustomerHit) => {
    onChange({ id: h.id, code: h.code, name: h.name, phone: h.phone, addresses: h.addresses, address: h.addresses[0] ?? "" });
    setQ("");
    setHits(null);
    setError(null);
  };

  if (value.id) {
    const others = value.addresses.filter((a) => a !== value.address);
    return (
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-royal to-royal-800 p-4 text-white shadow-lift">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 font-heading text-lg font-bold">
            {(value.name || "?").trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="inline-flex rounded-md bg-gold px-2 py-0.5 font-heading text-xs font-bold tracking-wide text-deep">{value.code}</p>
            <p className="mt-1 truncate font-heading text-lg font-semibold !text-white">{value.name || "Customer"}</p>
            {value.phone ? (
              <p className="flex items-center gap-1.5 text-sm text-white/80">
                <Phone aria-hidden className="size-3.5" /> {value.phone}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={() => onChange(EMPTY_CUSTOMER)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-sm font-medium hover:bg-white/20">
            <X aria-hidden className="size-4" /> Change
          </button>
        </div>
        {note ? <p className="text-sm font-medium text-success">{note}</p> : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-deep">
            <MapPin aria-hidden className="size-4 text-royal" /> Town / address <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <span className="relative">
            <input value={value.address} maxLength={500} onChange={(e) => onChange({ ...value, address: e.target.value })} placeholder="e.g. Kozhikode" className={cn(inputCls, "pr-9")} />
            {value.address ? (
              <button type="button" aria-label="Clear address" onClick={() => onChange({ ...value, address: "" })} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted">
                <X aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </span>
        </label>
        {others.length ? (
          <div className="-mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Used before:</span>
            {others.map((a) => (
              <button key={a} type="button" onClick={() => onChange({ ...value, address: a })} className="max-w-full truncate rounded-full border bg-white px-2.5 py-1 text-xs font-medium text-deep hover:border-royal-200 hover:text-royal">
                {a}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const typed = q.trim();
  const invalid = typed.length > 0 && !looksValid(typed);
  const noMatch = hits !== null && hits.length === 0 && looksValid(typed) && !busy;
  return (
    <div className="mt-3">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-royal" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!looksValid(e.target.value.trim())) setHits(null);
          }}
          placeholder="Customer ID (e.g. 12) or mobile number"
          aria-label="Find customer"
          className="h-12 w-full rounded-xl border-2 bg-white pr-10 pl-11 text-base outline-none focus:border-royal focus:ring-3 focus:ring-royal-100"
        />
        {busy ? <Loader2 aria-hidden className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
      </div>
      {invalid ? <p className="mt-2 text-sm text-muted-foreground">Type a Customer ID (like 12) or a mobile number.</p> : null}

      {hits?.length ? (
        <ul className="mt-2 flex flex-col gap-2">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => pick(h)} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left transition-colors hover:border-royal-200 hover:bg-royal-50/50">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-royal-50 text-royal">
                  <UserRound aria-hidden className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="font-heading text-sm font-bold whitespace-nowrap text-royal">{h.code}</span>
                    <span className="truncate text-sm font-semibold text-deep">{h.name || "—"}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{[h.phone, h.addresses[0]].filter(Boolean).join(" · ") || "No phone"}</span>
                </span>
                <span className="rounded-lg bg-royal px-3 py-1.5 text-xs font-semibold text-white">Select</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {noMatch ? (
        <div className="mt-3 rounded-2xl border-2 border-dashed border-royal/30 bg-royal-50/40 p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-deep">
            <UserPlus aria-hidden className="size-4 text-royal" /> No customer found. New customer ID:
            <span className="rounded-md bg-gold px-2 py-0.5 font-heading text-xs font-bold text-deep">{nextCode ?? "…"}</span>
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Customer name" aria-label="New customer name" className={inputCls} />
            <input value={draft.mobile} maxLength={15} inputMode="tel" onChange={(e) => setDraft({ ...draft, mobile: e.target.value.replace(/[^\d+ ]/g, "") })} placeholder="Mobile number" aria-label="New customer mobile" className={inputCls} />
            <input value={draft.address} maxLength={500} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Town / address (optional)" aria-label="New customer town or address" className={cn(inputCls, "sm:col-span-2")} />
          </div>
          <button
            type="button"
            disabled={creating}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await createBillCustomerAction(draft);
                if (!r.ok) return setError(r.error);
                setNote(r.existed ? `This mobile already belongs to ${r.customer.code}, so that customer was picked.` : `Customer ${r.customer.code} created.`);
                pick(r.customer);
                setDraft({ name: "", mobile: "", address: "" });
              })
            }
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-royal text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60"
          >
            {creating ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <UserPlus aria-hidden className="size-4" />} Create customer &amp; use
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            The mobile number links everything: when this customer registers on the website with the same number, this ID and these bills are theirs.
          </p>
          {error ? <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Customer ID (1–6 digits or KD-CUS-…) or a mobile number (7+ digits). Names aren't unique, so no name search. */
function looksValid(t: string) {
  const x = t.replace(/\s/g, "").toUpperCase();
  return /^(?:KD-?)?(?:CUS-?)?\d{1,6}$/.test(x) || /^\+?\d{7,15}$/.test(x);
}
