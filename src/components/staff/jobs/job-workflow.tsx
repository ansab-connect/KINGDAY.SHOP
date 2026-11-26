"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Eraser, Loader2, X } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { L } from "@/components/i18n/lang";
import { advanceJobAction, respondJobAction, saveInspectionAction } from "@/features/service/job-actions";
import { optimizeImage, randomFileId } from "@/lib/image-optimize";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Step = { status: string; en: string; ml: string; secondary?: boolean };
/**
 * Next steps per status (mirrors public.advance_service_job). Inspection comes first;
 * field visits add "on the way" / "reached" before it.
 */
const NEXT: Record<string, Step[]> = {
  accepted: [
    { status: "inspection_started", en: "Start inspection", ml: "പരിശോധന തുടങ്ങുക" },
    { status: "on_the_way", en: "I'm on the way (home visit)", ml: "ഞാൻ വഴിയിലാണ്", secondary: true },
  ],
  on_the_way: [{ status: "reached", en: "Reached location", ml: "സ്ഥലത്തെത്തി" }],
  reached: [
    { status: "inspection_started", en: "Start inspection", ml: "പരിശോധന തുടങ്ങുക" },
    { status: "started", en: "Start service directly", ml: "സർവീസ് തുടങ്ങുക", secondary: true },
  ],
  inspection_started: [{ status: "inspection_completed", en: "Inspection completed", ml: "പരിശോധന പൂർത്തിയായി" }],
  inspection_completed: [
    { status: "started", en: "Start service", ml: "സർവീസ് തുടങ്ങുക" },
    { status: "awaiting_parts", en: "Waiting for parts", ml: "പാർട്സിനായി കാത്തിരിക്കുന്നു", secondary: true },
  ],
  started: [
    { status: "completed", en: "Service completed", ml: "സർവീസ് പൂർത്തിയായി" },
    { status: "awaiting_parts", en: "Waiting for parts", ml: "പാർട്സിനായി കാത്തിരിക്കുന്നു", secondary: true },
  ],
  awaiting_parts: [{ status: "started", en: "Parts arrived — resume work", ml: "പാർട്സ് എത്തി — ജോലി തുടരുക" }],
  completed: [{ status: "ready_for_delivery", en: "Ready for delivery", ml: "ഡെലിവറിക്ക് തയ്യാർ" }],
  invoiced: [{ status: "ready_for_delivery", en: "Ready for delivery", ml: "ഡെലിവറിക്ക് തയ്യാർ" }],
};

/** Accept/decline, then one big button for the next step, with an optional note. */
export function JobActions({ bookingId, status }: { bookingId: string; status: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        setNote("");
        router.refresh();
      } else setError(res.error ?? "Couldn't update.");
    });

  const next = NEXT[status];
  if (status !== "assigned" && !next) return null;

  return (
    <div className="flex flex-col gap-3">
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Note (optional)" aria-label="Note" className={inputClass} />
      {status === "assigned" ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => window.confirm("Decline this job? It goes back to the office.") && run(() => respondJobAction({ bookingId, accept: false, note }))}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60"
          >
            <X aria-hidden className="size-4" /> <L en="Decline" ml="നിരസിക്കുക" />
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => respondJobAction({ bookingId, accept: true, note }))}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-success text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-60"
          >
            {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />} <L en="Accept job" ml="ജോലി സ്വീകരിക്കുക" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {next.map((s) => (
            <button
              key={s.status}
              type="button"
              disabled={pending}
              onClick={() => (s.status !== "completed" || window.confirm("Mark the service as completed?")) && run(() => advanceJobAction({ bookingId, status: s.status, note }))}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-xl font-semibold disabled:opacity-60",
                s.secondary ? "h-11 border bg-white text-sm text-deep hover:bg-muted" : "h-14 bg-royal text-base text-white hover:bg-royal-800",
              )}
            >
              {pending && !s.secondary ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
              <L en={s.en} ml={s.ml} />
            </button>
          ))}
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Inspection report

type Photo = { path: string; url: string | null };

function PhotoSet({ userId, label, value, onChange }: { userId: string; label: React.ReactNode; value: Photo[]; onChange: (v: Photo[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function add(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    setError(null);
    try {
      const next = [...value];
      for (const f of Array.from(files)) {
        if (next.length >= 6) break;
        const img = await optimizeImage(f, 1600);
        const path = `${userId}/${randomFileId()}.${img.extension}`;
        const { error: upErr } = await createClient().storage.from("service-media").upload(path, img.blob, { contentType: img.blob.type, upsert: false });
        if (upErr) throw new Error("Upload failed. Check your connection and try again.");
        next.push({ path, url: URL.createObjectURL(img.blob) });
      }
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-deep">{label}</span>
      <div className="flex flex-wrap gap-2">
        {value.map((p, i) => (
          <div key={p.path} className="relative size-20 overflow-hidden rounded-xl border bg-muted">
            {p.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- private / local preview
              <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
            ) : null}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove photo" className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-deep/70 text-white">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {value.length < 6 ? (
          <label className="grid size-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed text-muted-foreground hover:border-royal-300 hover:text-royal">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera aria-hidden className="size-6" />}
            <span className="sr-only">Add photo</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          </label>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/** Finger/mouse signature pad. Returns a PNG blob. */
function SignaturePad({ onChange }: { onChange: (b: Blob | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a0f2e";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) ref.current!.toBlob((b) => onChange(b), "image/png");
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={ref}
        className="h-40 w-full touch-none rounded-xl border-2 border-dashed bg-white"
        aria-label="Signature pad"
        onPointerDown={(e) => {
          drawing.current = true;
          dirty.current = true;
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ref.current!.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={finish}
        onPointerLeave={finish}
      />
      <button
        type="button"
        onClick={() => {
          const c = ref.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          dirty.current = false;
          onChange(null);
        }}
        className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold text-deep hover:bg-muted"
      >
        <Eraser aria-hidden className="size-4" /> <L en="Clear signature" ml="ഒപ്പ് മായ്ക്കുക" />
      </button>
    </div>
  );
}

export type InspectionInitial = {
  problem_found: string;
  work_performed: string;
  spare_parts: string;
  notes: string;
  before: Photo[];
  after: Photo[];
  confirmed_by: string;
  signature: Photo | null;
};

export function InspectionForm({ bookingId, userId, initial, showConfirmation }: { bookingId: string; userId: string; initial: InspectionInitial; showConfirmation: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [signature, setSignature] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof InspectionInitial) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      let signaturePath = v.signature?.path ?? "";
      if (signature) {
        const path = `${userId}/sign-${randomFileId()}.png`;
        const { error } = await createClient().storage.from("service-media").upload(path, signature, { contentType: "image/png", upsert: false });
        if (error) throw new Error("Signature upload failed. Please try again.");
        signaturePath = path;
      }
      const res = await saveInspectionAction({
        bookingId,
        problem_found: v.problem_found,
        work_performed: v.work_performed,
        spare_parts: v.spare_parts,
        notes: v.notes,
        before_photos: v.before.map((p) => p.path),
        after_photos: v.after.map((p) => p.path),
        confirmed_by: v.confirmed_by,
        signature_path: signaturePath,
      });
      if (!res.ok) throw new Error(res.error);
      setSignature(null);
      setMsg({ ok: true, text: "Report saved." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  const area = (k: "problem_found" | "work_performed" | "spare_parts" | "notes", en: string, ml: string, max: number) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
      <L en={en} ml={ml} />
      <textarea value={v[k]} onChange={set(k)} rows={3} maxLength={max} className={cn(inputClass, "h-auto py-2")} />
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      {area("problem_found", "Problem found", "കണ്ടെത്തിയ പ്രശ്നം", 2000)}
      {area("work_performed", "Work performed", "ചെയ്ത ജോലി", 2000)}
      {area("spare_parts", "Spare parts required", "ആവശ്യമായ സ്പെയർ പാർട്സ്", 1000)}
      {area("notes", "Additional notes", "കൂടുതൽ കുറിപ്പുകൾ", 2000)}
      <PhotoSet userId={userId} label={<L en="Before photos" ml="മുമ്പുള്ള ഫോട്ടോകൾ" />} value={v.before} onChange={(before) => setV({ ...v, before })} />
      <PhotoSet userId={userId} label={<L en="After photos" ml="ശേഷമുള്ള ഫോട്ടോകൾ" />} value={v.after} onChange={(after) => setV({ ...v, after })} />
      {showConfirmation ? (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <p className="text-sm font-semibold text-deep"><L en="Customer confirmation" ml="ഉപഭോക്താവിന്റെ സ്ഥിരീകരണം" /></p>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
            <L en="Customer name" ml="ഉപഭോക്താവിന്റെ പേര്" />
            <input value={v.confirmed_by} onChange={set("confirmed_by")} maxLength={120} className={inputClass} />
          </label>
          {v.signature?.url && !signature ? (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URL
            <img src={v.signature.url} alt="Saved signature" className="h-24 w-fit rounded-lg border bg-white" />
          ) : null}
          <p className="text-xs text-muted-foreground"><L en="Ask the customer to sign below." ml="താഴെ ഒപ്പിടാൻ ഉപഭോക്താവിനോട് പറയുക." /></p>
          <SignaturePad onChange={setSignature} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="inline-flex h-12 items-center gap-2 rounded-xl bg-royal px-6 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          <L en="Save report" ml="റിപ്പോർട്ട് സേവ് ചെയ്യുക" />
        </button>
        {msg ? <p role={msg.ok ? "status" : "alert"} className={cn("text-sm", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p> : null}
      </div>
    </div>
  );
}
