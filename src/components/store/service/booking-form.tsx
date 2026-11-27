"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bike, Camera, CarFront, Check, CheckCircle2, Clock, FileText, Home, Images, Loader2, MapPin, Package, Phone, ShieldCheck, Store, Wrench, X, type LucideIcon } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { L } from "@/components/i18n/lang";
import { useLang } from "@/components/i18n/language-switcher";
import { createServiceBookingAction } from "@/features/service/actions";
import { estimateVisitAction, type VisitEstimateResult } from "@/features/service/estimate";
import { MAX_PHOTOS, SERVICE_MEDIA_BUCKET } from "@/features/service/constants";
import { optimizeImage, randomFileId } from "@/lib/image-optimize";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LocationPicker, type LatLng } from "./location-picker";
import { VoiceRecorder, type VoiceNote } from "./voice-recorder";

export type Purchase = { key: string; orderId: string; orderNumber: string; productName: string; placedAt: string };
type Defaults = { name: string; mobile: string; email: string; address: string; code: string };
/** Catalog choices from Service Configuration (database). */
export type CatalogChoice = { slug: string; name: string; name_ml: string | null; parent?: string | null; id?: string; description?: string | null };
export type ModeChoice = { slug: string; title: string; title_ml: string | null; description: string | null; kind: "visit" | "centre" };
export type CentreChoice = { id: string; name: string; address: string; town: string | null; phone: string | null; working_hours: string | null; latitude: number | null; longitude: number | null };

const PURPLE = "#4B0082";
const TYPE_ICONS: LucideIcon[] = [Phone, ShieldCheck, Wrench];
const CAT_ICONS: Record<string, LucideIcon> = { bicycles: Bike, "ride-ons": CarFront, other: Package };

/** One numbered block of the form. */
function Step({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-card sm:p-6">
      <h2 className="mb-4 flex items-center gap-3 font-heading text-lg font-semibold text-[#1A0F2E]">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#4B0082] text-sm text-white">{n}</span>
        {title}
      </h2>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

/** A labelled question inside a step. */
function Field({ label, required, hint, children }: { label: React.ReactNode; required?: boolean; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-[#1A0F2E]">{label}{required ? <span className="text-danger"> *</span> : null}</span>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A tap-to-choose option with a radio circle, so it is obvious it can be selected. */
function Choice({ selected, onClick, icon: Icon, title, desc, children }: { selected: boolean; onClick: () => void; icon?: LucideIcon; title: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition-colors",
        selected ? "border-[#4B0082] bg-[#4B0082]/[0.05]" : "border-border bg-white hover:border-[#4B0082]/40",
      )}
    >
      <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", selected ? "border-[#4B0082] bg-[#4B0082]" : "border-muted-foreground/40")}>
        {selected ? <Check aria-hidden className="size-3 text-white" strokeWidth={3} /> : null}
      </span>
      {Icon ? <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", selected ? "text-[#4B0082]" : "text-muted-foreground")} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#1A0F2E]">{title}</span>
        {desc ? <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span> : null}
        {children}
      </span>
    </button>
  );
}

const km = (a: LatLng, b: { latitude: number; longitude: number }) => {
  const R = 6371, d = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(d(b.latitude - a.lat) / 2) ** 2 + Math.cos(d(a.lat)) * Math.cos(d(b.latitude)) * Math.sin(d(b.longitude - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export function BookingForm({ userId, defaults, purchases, categories, types, modes, centres }: {
  userId: string; defaults: Defaults; purchases: Purchase[]; categories: CatalogChoice[]; types: CatalogChoice[]; modes: ModeChoice[]; centres: CentreChoice[];
}) {
  const ml = useLang() === "ml";
  const t = (c: { name: string; name_ml: string | null }) => (ml && c.name_ml ? c.name_ml : c.name);
  const known = Boolean(defaults.name && defaults.mobile);
  // One key per form: a double tap or retry returns the same booking instead of a duplicate.
  const clientKey = useRef(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "");
  const [serviceType, setServiceType] = useState("");
  const [main, setMain] = useState("");
  const [category, setCategory] = useState("");
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [fromKingDay, setFromKingDay] = useState<boolean | null>(null);
  const [purchaseKey, setPurchaseKey] = useState("");
  const [productName, setProductName] = useState("");
  const [bill, setBill] = useState<File | null>(null);
  const [complaint, setComplaint] = useState("");
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [mode, setMode] = useState("");
  const [centre, setCentre] = useState("");
  const [address, setAddress] = useState(defaults.address);
  const [town, setTown] = useState("");
  const [instructions, setInstructions] = useState("");
  const [location, setLocation] = useState<LatLng | null>(null);
  const [name, setName] = useState(defaults.name);
  const [mobile, setMobile] = useState(defaults.mobile);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const mains = categories.filter((c) => !c.parent);
  const subs = categories.filter((c) => c.parent && c.parent === mains.find((m) => m.slug === main)?.id);
  const modeKind = modes.find((m) => m.slug === mode)?.kind;
  const purchase = purchases.find((p) => p.key === purchaseKey);
  const sortedCentres = useMemo(
    () => centres.map((c) => ({ ...c, dist: location && c.latitude != null && c.longitude != null ? km(location, { latitude: c.latitude, longitude: c.longitude }) : null })).sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9)),
    [centres, location],
  );

  function pickMain(slug: string) {
    setMain(slug);
    const m = mains.find((x) => x.slug === slug);
    const hasSubs = categories.some((c) => c.parent && c.parent === m?.id);
    setCategory(hasSubs ? "" : slug);
  }
  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = [...photos];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_PHOTOS) break;
      if (/^image\/(jpeg|png|webp)$/.test(f.type)) next.push({ file: f, url: URL.createObjectURL(f) });
    }
    setPhotos(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const missing = !known && (name.trim().length < 2 || mobile.trim().length < 7) ? "Enter your name and mobile number." : !category ? "Choose your product." : fromKingDay === null ? "Tell us where you bought it." : !serviceType ? "Choose the service you need." : complaint.trim().length < 5 && !voice ? "Describe the problem or record a voice note." : !mode ? "Choose where you want the service." : modeKind === "centre" && !centre ? "Choose a service centre." : modeKind === "visit" && address.trim().length < 5 ? "Enter the service address." : null;
    if (missing) {
      setError(missing);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Every file is uploaded first; the booking is created only if all uploads succeed.
      const storage = createClient().storage.from(SERVICE_MEDIA_BUCKET);
      const photoPaths: string[] = [];
      for (const [i, p] of photos.entries()) {
        setStage(`Uploading photo ${i + 1} of ${photos.length}…`);
        const img = await optimizeImage(p.file, 1600);
        const path = `${userId}/${randomFileId()}.${img.extension}`;
        const { error: upErr } = await storage.upload(path, img.blob, { contentType: img.blob.type, upsert: false });
        if (upErr) throw new Error("Photo upload failed. Please try again.");
        photoPaths.push(path);
      }
      let billPath = "";
      if (fromKingDay && bill) {
        setStage("Uploading your bill…");
        const isPdf = bill.type === "application/pdf";
        const blob = isPdf ? bill : (await optimizeImage(bill, 1800)).blob;
        const ext = isPdf ? "pdf" : blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
        const path = `${userId}/invoice-${randomFileId()}.${ext}`;
        const { error: upErr } = await storage.upload(path, blob, { contentType: blob.type, upsert: false });
        if (upErr) throw new Error("Bill upload failed. Please try again, or remove it.");
        billPath = path;
      }
      let voicePath = "";
      if (voice) {
        setStage("Uploading voice note…");
        const path = `${userId}/voice-${randomFileId()}.${voice.ext}`;
        const { error: upErr } = await storage.upload(path, voice.blob, { contentType: voice.blob.type, upsert: false });
        if (upErr) throw new Error("Voice note upload failed. Please try again.");
        voicePath = path;
      }
      setStage("Booking…");
      const res = await createServiceBookingAction({
        customer_name: name, mobile, email: defaults.email, category, service_type: serviceType, booking_kind: "service",
        purchase_source: fromKingDay ? "kingday" : "external", order_id: fromKingDay && purchase ? purchase.orderId : "",
        purchase_details: fromKingDay && purchase ? `KING DAY order ${purchase.orderNumber} · ${purchase.productName}` : "",
        product_name: fromKingDay && purchase ? purchase.productName : productName,
        complaint, voice_path: voicePath, voice_duration_seconds: voice?.seconds ?? null, photo_paths: photoPaths, purchase_invoice_path: billPath,
        service_mode: mode, service_centre_id: modeKind === "centre" ? centre : "", address: modeKind === "visit" ? address : "", town, instructions,
        latitude: modeKind === "visit" ? (location?.lat ?? null) : null, longitude: modeKind === "visit" ? (location?.lng ?? null) : null,
        client_key: clientKey.current,
      });
      if (res.ok) {
        setDone(res.code);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else setError(res.fieldErrors ? Object.values(res.fieldErrors)[0] ?? res.error : res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-3xl border bg-white p-8 text-center shadow-card">
        <CheckCircle2 aria-hidden className="size-14 text-success" />
        <h2 className="text-2xl font-bold text-[#1A0F2E]"><L en="Service booked" ml="സർവീസ് ബുക്ക് ചെയ്തു" /></h2>
        <p className="text-sm text-muted-foreground"><L en="Your Service Booking ID" ml="നിങ്ങളുടെ ബുക്കിംഗ് ഐഡി" /></p>
        <p className="rounded-xl bg-[#4B0082] px-5 py-3 font-mono text-2xl font-bold tracking-wider text-[#D4AF37]">{done}</p>
        <p className="text-sm text-muted-foreground"><L en="Our team will call you to confirm. You can follow every step in My Services." ml="ഞങ്ങൾ നിങ്ങളെ വിളിക്കും. ഓരോ ഘട്ടവും My Services-ൽ കാണാം." /></p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/account/service" className="inline-flex h-11 items-center rounded-full bg-[#4B0082] px-5 text-sm font-semibold text-white"><L en="My services" ml="എന്റെ സർവീസുകൾ" /></Link>
          <Link href="/" className="inline-flex h-11 items-center rounded-full border px-5 text-sm font-semibold text-[#1A0F2E]"><L en="Back to home" ml="ഹോമിലേക്ക്" /></Link>
        </div>
      </div>
    );
  }


  const chip = (on: boolean) => cn("h-11 rounded-full border-2 px-5 text-sm font-semibold", on ? "border-[#4B0082] bg-[#4B0082] text-white" : "border-border bg-white text-[#1A0F2E] hover:border-[#4B0082]/40");
  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Step n={1} title={<L en="Your details" ml="നിങ്ങളുടെ വിവരങ്ങൾ" />}>
        {known ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F4EEFA] px-4 py-3 text-sm">
            <span><span className="font-semibold text-[#1A0F2E]">{defaults.name}</span> · {defaults.mobile}{defaults.code ? <span className="ml-2 font-mono text-xs text-[#4B0082]">{defaults.code}</span> : null}</span>
            <Link href="/account" className="font-semibold text-[#4B0082] hover:underline"><L en="Change" ml="മാറ്റുക" /></Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={<L en="Name" ml="പേര്" />} required><input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={inputClass} /></Field>
            <Field label={<L en="Mobile number" ml="മൊബൈൽ നമ്പർ" />} required><input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" inputMode="tel" maxLength={20} autoComplete="tel" className={inputClass} /></Field>
          </div>
        )}
      </Step>

      <Step n={2} title={<L en="Your product" ml="നിങ്ങളുടെ ഉൽപ്പന്നം" />}>
        <Field label={<L en="What is it?" ml="ഏത് ഉൽപ്പന്നം?" />} required>
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {mains.map((m) => {
              const Icon = CAT_ICONS[m.slug] ?? Package;
              return (
                <button key={m.slug} type="button" role="radio" aria-checked={main === m.slug} onClick={() => pickMain(m.slug)} className={cn(chip(main === m.slug), "inline-flex items-center gap-2")}>
                  <Icon aria-hidden className="size-4" /> {t(m)}
                </button>
              );
            })}
          </div>
          {subs.length ? (
            <div role="radiogroup" className="mt-1 flex flex-wrap gap-2 rounded-xl bg-muted/50 p-2">
              {subs.map((s) => (
                <button key={s.slug} type="button" role="radio" aria-checked={category === s.slug} onClick={() => setCategory(s.slug)} className={cn(chip(category === s.slug), "h-10 px-4")}>{t(s)}</button>
              ))}
            </div>
          ) : null}
        </Field>

        <Field label={<L en="Where did you buy it?" ml="എവിടെ നിന്നാണ് വാങ്ങിയത്?" />} required>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
            <Choice selected={fromKingDay === true} onClick={() => setFromKingDay(true)} title={<L en="Bought from KING DAY" ml="KING DAY-ൽ നിന്ന് വാങ്ങിയത്" />} />
            <Choice selected={fromKingDay === false} onClick={() => setFromKingDay(false)} title={<L en="Bought from another shop" ml="മറ്റൊരു കടയിൽ നിന്ന് വാങ്ങിയത്" />} />
          </div>
        </Field>
        {fromKingDay ? (
          <div className="flex flex-col gap-3">
            {purchases.length ? (
              <Field label={<L en="Which order? (optional)" ml="ഏത് ഓർഡർ? (ഐച്ഛികം)" />}>
                <select value={purchaseKey} onChange={(e) => setPurchaseKey(e.target.value)} className={inputClass}>
                  <option value="">{ml ? "തിരഞ്ഞെടുക്കുക…" : "Choose…"}</option>
                  {purchases.map((p) => <option key={p.key} value={p.key}>{p.productName} · {p.orderNumber}</option>)}
                </select>
              </Field>
            ) : null}
            <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border-2 border-dashed border-[#4B0082]/30 px-4 py-2.5 text-sm font-semibold text-[#4B0082] hover:border-[#D4AF37]">
              <FileText aria-hidden className="size-4" />{bill ? bill.name : <L en="Add the bill photo (optional)" ml="ബില്ലിന്റെ ഫോട്ടോ ചേർക്കുക (ഐച്ഛികം)" />}
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setBill(e.target.files?.[0] ?? null)} />
            </label>
            {bill ? <button type="button" onClick={() => setBill(null)} className="w-fit text-xs text-danger underline"><L en="Remove bill" ml="ബിൽ നീക്കുക" /></button> : null}
          </div>
        ) : fromKingDay === false ? (
          <Field label={<L en="Product name (optional)" ml="ഉൽപ്പന്നത്തിന്റെ പേര് (ഐച്ഛികം)" />}>
            <input value={productName} onChange={(e) => setProductName(e.target.value)} maxLength={200} placeholder={ml ? "ഉദാ: 12V ഇലക്ട്രിക് ജീപ്പ്" : "e.g. 12V electric jeep, red"} className={inputClass} />
          </Field>
        ) : null}

        <Field label={<L en="Photos (optional)" ml="ഫോട്ടോകൾ (ഐച്ഛികം)" />} hint={<L en={`Up to ${MAX_PHOTOS}. Show the problem area.`} ml={`${MAX_PHOTOS} വരെ. പ്രശ്നമുള്ള ഭാഗം കാണിക്കുക.`} />}>
          <div className="flex flex-wrap gap-3">
            {photos.map((p, i) => (
              <div key={p.url} className="relative size-20 overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview before upload */}
                <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label="Remove photo" className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-[#1A0F2E]/75 text-white"><X className="size-3.5" /></button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <>
                <label className="grid size-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-[#4B0082]/30 text-[#4B0082] hover:border-[#D4AF37]">
                  <span className="flex flex-col items-center gap-1 text-xs font-semibold"><Camera aria-hidden className="size-5" /><L en="Camera" ml="ക്യാമറ" /></span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
                </label>
                <label className="grid size-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-[#4B0082]/30 text-[#4B0082] hover:border-[#D4AF37]">
                  <span className="flex flex-col items-center gap-1 text-xs font-semibold"><Images aria-hidden className="size-5" /><L en="Gallery" ml="ഗാലറി" /></span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
                </label>
              </>
            ) : null}
          </div>
        </Field>
      </Step>

      <Step n={3} title={<L en="The problem" ml="പ്രശ്നം" />}>
        <Field label={<L en="What do you need?" ml="എന്ത് സർവീസ് വേണം?" />} required>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
            {types.map((ty, i) => <Choice key={ty.slug} selected={serviceType === ty.slug} onClick={() => setServiceType(ty.slug)} icon={TYPE_ICONS[i % TYPE_ICONS.length]} title={t(ty)} desc={ty.description} />)}
          </div>
        </Field>
        <Field label={<L en="Tell us the problem" ml="പ്രശ്നം പറയൂ" />} required hint={<L en="Type it, or record a voice note — or both." ml="ടൈപ്പ് ചെയ്യുക, അല്ലെങ്കിൽ ശബ്ദ സന്ദേശം റെക്കോർഡ് ചെയ്യുക." />}>
          <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={3} maxLength={3000} placeholder={ml ? "ഉദാ: ബാറ്ററി ചാർജ് ആകുന്നില്ല" : "e.g. Battery not charging, brake noise"} className={cn(inputClass, "h-auto py-2")} />
          <VoiceRecorder value={voice} onChange={setVoice} status={busy && stage?.startsWith("Uploading voice") ? stage : null} />
        </Field>
      </Step>

      <Step n={4} title={<L en="Where should we service it?" ml="എവിടെ വെച്ച് സർവീസ് ചെയ്യണം?" />}>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
          {modes.map((m) => <Choice key={m.slug} selected={mode === m.slug} onClick={() => setMode(m.slug)} icon={m.kind === "centre" ? Store : Home} title={ml && m.title_ml ? m.title_ml : m.title} desc={m.description} />)}
        </div>
        {modeKind === "visit" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label={<L en="Address" ml="വിലാസം" />} required>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} maxLength={500} autoComplete="street-address" className={cn(inputClass, "h-auto py-2")} />
            </Field></div>
            <Field label={<L en="Town / place" ml="സ്ഥലം" />}><input value={town} onChange={(e) => setTown(e.target.value)} maxLength={80} className={inputClass} /></Field>
            <Field label={<L en="Note for the technician (optional)" ml="ടെക്നീഷ്യന് കുറിപ്പ് (ഐച്ഛികം)" />}><input value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={500} placeholder={ml ? "ഉദാ: ഗേറ്റിനടുത്ത് വിളിക്കുക" : "e.g. Call at the gate"} className={inputClass} /></Field>
            <div className="sm:col-span-2"><LocationPicker value={location} onChange={setLocation} /></div>
            {location ? <div className="sm:col-span-2"><VisitEstimate location={location} /></div> : null}
          </div>
        ) : modeKind === "centre" ? (
          <div role="radiogroup" className="flex flex-col gap-2">
            {sortedCentres.length === 0 ? <p className="text-sm text-muted-foreground"><L en="No service centres are open for booking right now. Please choose a home visit." ml="സർവീസ് സെന്ററുകൾ ഇപ്പോൾ ലഭ്യമല്ല. വീട്ടിൽ വന്ന് സർവീസ് തിരഞ്ഞെടുക്കുക." /></p> : null}
            {sortedCentres.map((c) => (
              <Choice key={c.id} selected={centre === c.id} onClick={() => setCentre(c.id)} icon={MapPin} title={c.name} desc={c.address}>
                <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {c.dist != null ? <span>≈ {c.dist.toFixed(1)} km away</span> : null}
                  {c.working_hours ? <span className="inline-flex items-center gap-1"><Clock aria-hidden className="size-3" /> {c.working_hours}</span> : null}
                  {c.phone ? <span className="inline-flex items-center gap-1"><Phone aria-hidden className="size-3" /> {c.phone}</span> : null}
                </span>
              </Choice>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground"><L en="No need to pick a date. We will call you to fix a convenient time." ml="തീയതി തിരഞ്ഞെടുക്കേണ്ട. സൗകര്യപ്രദമായ സമയം ഞങ്ങൾ വിളിച്ച് ഉറപ്പിക്കും." /></p>
      </Step>

      {error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      <button type="submit" disabled={busy} className="inline-flex h-14 items-center justify-center gap-2 rounded-full px-8 text-base font-bold text-[#1A0F2E] shadow-[0_14px_34px_-14px_rgb(212_175_55/0.9)] disabled:opacity-60" style={{ background: "linear-gradient(135deg,#E8C964,#D4AF37)" }}>
        {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Wrench aria-hidden className="size-5" color={PURPLE} />}
        {busy ? (stage ?? "…") : <L en="Book service" ml="സർവീസ് ബുക്ക് ചെയ്യുക" />}
      </button>
    </form>
  );
}

/** Approximate road distance and inspection charge for a home visit (final uses the verified distance). */
function VisitEstimate({ location }: { location: LatLng }) {
  const [state, setState] = useState<{ key: string; r: VisitEstimateResult } | null>(null);
  const key = `${location.lat.toFixed(4)},${location.lng.toFixed(4)}`;
  useEffect(() => {
    let alive = true;
    void estimateVisitAction({ lat: location.lat, lng: location.lng }).then((r) => alive && setState({ key, r }));
    return () => {
      alive = false;
    };
  }, [key, location.lat, location.lng]);
  const r = state?.key === key ? state.r : null;
  if (!r) return <p className="text-xs text-muted-foreground"><L en="Calculating distance…" ml="ദൂരം കണക്കാക്കുന്നു…" /></p>;
  if (!r.ok) return null;
  return (
    <p className="rounded-xl bg-[#F4EEFA] px-4 py-3 text-sm text-[#1A0F2E]">
      <L en="Distance from KING DAY" ml="KING DAY-ൽ നിന്നുള്ള ദൂരം" />: <span className="font-semibold">≈ {r.km} km</span>
      {r.chargePaise != null ? <> · <L en="Inspection charge about" ml="പരിശോധനാ ചാർജ് ഏകദേശം" /> <span className="font-semibold">₹{(r.chargePaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></> : null}
      <span className="mt-1 block text-xs text-muted-foreground"><L en="Approximate. The final amount uses the distance our technician confirms." ml="ഏകദേശ തുക. ടെക്നീഷ്യൻ ഉറപ്പിക്കുന്ന ദൂരം അനുസരിച്ചാണ് അന്തിമ തുക." /></span>
    </p>
  );
}
