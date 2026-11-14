"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, CheckCircle2, Loader2, Trash2, Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { checkoutServiceCartAction, removeServiceCartItemAction } from "@/features/service/actions";

export type ServiceCartLine = {
  id: string;
  category: string;
  serviceType: string;
  product: string;
  complaint: string | null;
  hasVoice: boolean;
  photos: number;
  address: string;
  date: string;
  time: string;
};

const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

export function ServiceCartView({ lines, basicCharge }: { lines: ServiceCartLine[]; basicCharge: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  if (codes) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border bg-white p-8 text-center shadow-card">
        <CheckCircle2 aria-hidden className="size-12 text-success" />
        <h2 className="text-2xl font-bold text-deep"><L en="Services booked" ml="സർവീസുകൾ ബുക്ക് ചെയ്തു" /></h2>
        <ul className="flex flex-wrap justify-center gap-2">
          {codes.map((c) => <li key={c} className="rounded-lg bg-royal-50 px-3 py-1.5 font-mono font-bold text-royal">{c}</li>)}
        </ul>
        <p className="text-sm text-muted-foreground"><L en="Our team will call you to confirm each visit." ml="ഓരോ സന്ദർശനവും ഉറപ്പിക്കാൻ ഞങ്ങൾ വിളിക്കും." /></p>
        <Link href="/account/service" className="inline-flex h-11 items-center rounded-full bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800"><L en="My services" ml="എന്റെ സർവീസുകൾ" /></Link>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed bg-white px-6 py-14 text-center">
        <Wrench aria-hidden className="size-10 text-royal-300" />
        <p className="mt-4 font-heading text-lg font-semibold text-deep"><L en="Your service cart is empty" ml="സർവീസ് കാർട്ട് ശൂന്യമാണ്" /></p>
        <Link href="/book-service" className="mt-6 rounded-full bg-royal px-5 py-2.5 text-sm font-semibold text-white"><L en="Add a service" ml="സർവീസ് ചേർക്കുക" /></Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <ul className="flex flex-col gap-3">
        {lines.map((l) => (
          <li key={l.id} className="rounded-2xl border bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-gold-700 uppercase">{l.category} · {l.serviceType}</p>
                <p className="mt-1 font-semibold text-deep">{l.product}</p>
                <p className="mt-1 text-sm text-muted-foreground">{l.date} · {l.time}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">{l.address}</p>
                {l.complaint ? <p className="mt-2 line-clamp-2 text-sm text-deep/80">{l.complaint}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {[l.hasVoice ? "Voice note" : null, l.photos ? `${l.photos} photo${l.photos === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => { await removeServiceCartItemAction(l.id); router.refresh(); })}
                aria-label={`Remove ${l.product}`}
                className="grid size-9 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger-soft"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
        <li>
          <Link href="/book-service" className="inline-flex h-11 items-center rounded-full border bg-white px-5 text-sm font-semibold text-royal hover:bg-royal-50">
            <L en="+ Add another service" ml="+ മറ്റൊരു സർവീസ്" />
          </Link>
        </li>
      </ul>
      <aside className="h-fit rounded-2xl border bg-white p-5 shadow-card lg:sticky lg:top-28">
        <h2 className="font-heading text-lg font-semibold text-deep"><L en="Summary" ml="സംഗ്രഹം" /></h2>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground"><L en="Services" ml="സർവീസുകൾ" /></dt><dd className="tabular">{lines.length}</dd></div>
          {basicCharge > 0 ? (
            <div className="flex justify-between"><dt className="text-muted-foreground"><L en="Basic charge (each)" ml="അടിസ്ഥാന ചാർജ് (ഓരോന്നിനും)" /></dt><dd className="tabular">{rupees(basicCharge)}</dd></div>
          ) : null}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          <L en="Labour and spare parts are added after the technician checks the product. You pay after the service." ml="ലേബറും സ്പെയർ പാർട്സും പരിശോധനയ്ക്ക് ശേഷം ചേർക്കും. സർവീസിന് ശേഷം പണം നൽകാം." />
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await checkoutServiceCartAction();
              if (res.ok) setCodes(res.codes);
              else setError(res.error);
            })
          }
          className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gold text-sm font-bold text-deep hover:bg-gold-300 disabled:opacity-60"
        >
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <CalendarCheck aria-hidden className="size-4" />}
          <L en={`Book ${lines.length} service${lines.length === 1 ? "" : "s"}`} ml="ബുക്ക് ചെയ്യുക" />
        </button>
        {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      </aside>
    </div>
  );
}
