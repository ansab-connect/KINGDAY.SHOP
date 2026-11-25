"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, X } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { assignProductsToCategory, removeProductFromCategory } from "@/features/catalog/admin-actions";
import { cn } from "@/lib/utils";

export type CategoryProduct = { id: string; name: string; status: string; main: boolean; mainCategory: string };

/**
 * "Products in this category": products whose main category is this one, plus products
 * added here as an extra category. Add many at once from the search list; removing only
 * takes a product out of this category (its main category stays).
 */
export function CategoryProducts({ categoryId, assigned, all, canEdit }: { categoryId: string; assigned: CategoryProduct[]; all: CategoryProduct[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const here = useMemo(() => new Set(assigned.map((a) => a.id)), [assigned]);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((p) => !here.has(p.id) && (!t || p.name.toLowerCase().includes(t))).slice(0, 40);
  }, [all, here, q]);

  const add = () =>
    start(async () => {
      const r = await assignProductsToCategory(categoryId, [...picked]);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Added." } : { ok: false, text: r.error });
      if (r.ok) {
        setPicked(new Set());
        setQ("");
        router.refresh();
      }
    });
  const remove = (id: string) =>
    start(async () => {
      const r = await removeProductFromCategory(categoryId, id);
      setMsg(r.ok ? { ok: true, text: "Removed from this category." } : { ok: false, text: r.error });
      router.refresh();
    });

  return (
    <section className="mt-6 rounded-2xl border bg-white p-4 shadow-card sm:p-6">
      <h2 className="font-heading text-base font-bold text-deep">Products in this category ({assigned.length})</h2>
      <p className="mt-1 text-sm text-muted-foreground">Add products to show them here too. Their main category stays the same.</p>
      {msg ? <p role="status" className={cn("mt-3 rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{msg.text}</p> : null}

      {canEdit ? (
        <div className="mt-4 rounded-xl border bg-muted/20 p-3">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products to add…" aria-label="Search products to add" className={cn(inputClass, "pl-9")} />
          </div>
          <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border bg-white">
            {hits.map((p) => (
              <li key={p.id} className="border-b last:border-b-0">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-royal-50/50">
                  <input
                    type="checkbox"
                    className="size-4 accent-royal"
                    checked={picked.has(p.id)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(p.id);
                        else n.delete(p.id);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-deep">{p.name}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">in {p.mainCategory}</span>
                </label>
              </li>
            ))}
            {!hits.length ? <li className="px-3 py-4 text-center text-sm text-muted-foreground">No other products match.</li> : null}
          </ul>
          <button type="button" onClick={add} disabled={!picked.size || pending} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-700 disabled:opacity-50">
            {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
            Add {picked.size || ""} to this category
          </button>
        </div>
      ) : null}

      {assigned.length ? (
        <ul className="mt-4 divide-y rounded-xl border">
          {assigned.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Link href={`/admin/products/${p.id}`} className="min-w-0 flex-1 truncate font-medium text-deep hover:text-royal">{p.name}</Link>
              {p.status !== "active" ? <span className="rounded bg-muted px-1.5 py-0.5 text-[0.7rem] text-muted-foreground">{p.status === "draft" ? "Hidden" : p.status}</span> : null}
              {p.main ? (
                <span className="rounded bg-royal-50 px-1.5 py-0.5 text-[0.7rem] font-semibold text-royal" title="Change it in the product's Category field">Main category</span>
              ) : canEdit ? (
                <button type="button" onClick={() => remove(p.id)} disabled={pending} aria-label={`Remove ${p.name} from this category`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger-soft">
                  <X className="size-3.5" /> Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">No products in this category yet.</p>
      )}
    </section>
  );
}
