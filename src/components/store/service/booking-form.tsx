"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bike, Camera, CarFront, Check, CheckCircle2, Clock, FileText, Home, Images, Loader2, MapPin, Package, Phone, ShieldCheck, Store, Wrench, X, type LucideIcon } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { L } from "@/components/i18n/lang";
import { useLang } from "@/components/i18n/language-switcher";
import { createServiceBookingAction } from "@/features/service/actions";
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

function Section({ n, title, hint, children }: { n: number; title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[#4B0082]/10 bg-white p-5 shadow-[0_10px_40px_-24px_rgb(75_0_130/0.45)] sm:p-7">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#1A0F2E] text-sm font-bold text-[#D4AF37]">{n}</span>
        <div>
          <h2 className="font-heading text-lg font-bold text-[#1A0F2E]">{title}</h2>
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Card({ selected, onClick, icon: Icon, title, desc, children }: { selected: boolean; onClick: () => void; icon?: LucideIcon; title: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all",
        selected ? "border-[#4B0082] bg-[#4B0082]/[0.04] shadow-[0_8px_24px_-12px_rgb(75_0_130/0.6)]" : "border-border bg-white hover:border-[#D4AF37]",
      )}
    >
      {Icon ? (
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", selected ? "bg-[#4B0082] text-[#D4AF37]" : "bg-[#F4EEFA] text-[#4B0082]")}>
          <Icon aria-hidden className="size-5" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[#1A0F2E]">{title}</span>
        {desc ? <span className="mt-0.5 block text-sm text-muted-foreground">{desc}</span> : null}
        {children}
      </span>
      {selected ? <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-[#D4AF37] text-[#1A0F2E]"><Check aria-hidden className="size-4" /></span> : null}
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
    const missing = !serviceType ? "Choose the service type." : !category ? "Choose your product category." : complaint.trim().length < 5 && !voice ? "Describe the problem or record a voice note." : !mode ? "Choose where you want the service." : modeKind === "centre" && !centre ? "Choose a service centre." : modeKind === "visit" && address.trim().length < 5 ? "Enter the service address." : !known && (name.trim().length < 2 || mobile.trim().length < 7) ? "Enter your name and mobile number." : null;
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

  let n = 0;
  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Section n={++n} title={<L en="What kind of service?" ml="ഏത് തരം സർവീസ്?" />}>
        <div className="grid gap-3 sm:grid-cols-3">
          {types.map((ty, i) => <Card key={ty.slug} selected={serviceType === ty.slug} onClick={() => setServiceType(ty.slug)} icon={TYPE_ICONS[i % TYPE_ICONS.length]} title={t(ty)} desc={ty.description} />)}
        </div>
      </Section>

      <Section n={++n} title={<L en="Your product" ml="നിങ്ങളുടെ ഉൽപ്പന്നം" />}>
        <div className="grid gap-3 sm:grid-cols-3">
          {mains.map((m) => <Card key={m.slug} selected={main === m.slug} onClick={() => pickMain(m.slug)} icon={CAT_ICONS[m.slug] ?? Package} title={t(m)} />)}
        </div>
        {subs.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {subs.map((s) => (
              <button key={s.slug} type="button" aria-pressed={category === s.slug} onClick={() => setCategory(s.slug)}
                className={cn("h-11 rounded-full border-2 px-5 text-sm font-semibold", category === s.slug ? "border-[#4B0082] bg-[#4B0082] text-white" : "border-border bg-white text-[#1A0F2E] hover:border-[#D4AF37]")}>
                {t(s)}
              </button>
            ))}
          </div>
        ) : null}
      </Section>

      <Section n={++n} title={<L en="Photos of the product" ml="ഉൽപ്പന്നത്തിന്റെ ഫോട്ടോകൾ" />} hint={<L en={`Optional, up to ${MAX_PHOTOS}. Show the problem area.`} ml={`ഐച്ഛികം, ${MAX_PHOTOS} വരെ.`} />}>
        <div className="flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <div key={p.url} className="relative size-24 overflow-hidden rounded-2xl border">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview before upload */}
              <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
              <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label="Remove photo" className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-[#1A0F2E]/75 text-white"><X className="size-4" /></button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <>
              <label className="grid size-24 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[#4B0082]/30 text-[#4B0082] hover:border-[#D4AF37]">
                <span className="flex flex-col items-center gap-1 text-xs font-semibold"><Camera aria-hidden className="size-6" /><L en="Camera" ml="ക്യാമറ" /></span>
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              </label>
              <label className="grid size-24 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[#4B0082]/30 text-[#4B0082] hover:border-[#D4AF37]">
                <span className="flex flex-col items-center gap-1 text-xs font-semibold"><Images aria-hidden className="size-6" /><L en="Gallery" ml="ഗാലറി" /></span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              </label>
            </>
          ) : null}
        </div>
      </Section>

      <Section n={++n} title={<L en="Was it bought from KING DAY?" ml="KING DAY-ൽ നിന്നാണോ വാങ്ങിയത്?" />}>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Card selected={fromKingDay === true} onClick={() => setFromKingDay(true)} title={<L en="Yes" ml="അതെ" />} />
          <Card selected={fromKingDay === false} onClick={() => setFromKingDay(false)} title={<L en="No" ml="അല്ല" />} />
        </div>
        {fromKingDay ? (
          <div className="mt-4 flex flex-col gap-3">
            {purchases.length ? (
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-[#1A0F2E]"><L en="Your order (optional)" ml="ഓർഡർ (ഐച്ഛികം)" /></span>
                <select value={purchaseKey} onChange={(e) => setPurchaseKey(e.target.value)} className={inputClass}>
                  <option value="">{ml ? "തിരഞ്ഞെടുക്കുക…" : "Choose…"}</option>
                  {purchases.map((p) => <option key={p.key} value={p.key}>{p.productName} · {p.orderNumber}</option>)}
                </select>
              </label>
            ) : null}
            <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border-2 border-dashed border-[#4B0082]/30 px-4 py-2.5 text-sm font-semibold text-[#4B0082] hover:border-[#D4AF37]">
              <FileText aria-hidden className="size-4" />{bill ? bill.name : <L en="Attach bill (photo or PDF, optional)" ml="ബിൽ ചേർക്കുക (ഐച്ഛികം)" />}
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setBill(e.target.files?.[0] ?? null)} />
            </label>
            {bill ? <button type="button" onClick={() => setBill(null)} className="w-fit text-xs text-danger underline"><L en="Remove bill" ml="ബിൽ നീക്കുക" /></button> : null}
          </div>
        ) : null}
      </Section>

      <Section n={++n} title={<L en="Tell us the problem" ml="പ്രശ്നം പറയൂ" />} hint={<L en="Type it, record a voice note, or both." ml="ടൈപ്പ് ചെയ്യുക, അല്ലെങ്കിൽ ശബ്ദ സന്ദേശം." />}>
        <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={4} maxLength={3000} placeholder={ml ? "ഉദാ: ബാറ്ററി ചാർജ് ആകുന്നില്ല" : "e.g. Battery not charging, brake noise"} className={cn(inputClass, "h-auto py-2")} />
        <div className="mt-3"><VoiceRecorder value={voice} onChange={setVoice} status={busy && stage?.startsWith("Uploading voice") ? stage : null} /></div>
      </Section>

      <Section n={++n} title={<L en="Where would you like your service?" ml="സർവീസ് എവിടെ വേണം?" />}>
        <div className="grid gap-3 sm:grid-cols-2">
          {modes.map((m) => <Card key={m.slug} selected={mode === m.slug} onClick={() => setMode(m.slug)} icon={m.kind === "centre" ? Store : Home} title={ml && m.title_ml ? m.title_ml : m.title} desc={m.description} />)}
        </div>
        {modeKind === "visit" ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2"><span className="font-medium text-[#1A0F2E]"><L en="Address" ml="വിലാസം" /> <span className="text-danger">*</span></span>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} maxLength={500} autoComplete="street-address" className={cn(inputClass, "h-auto py-2")} />
            </label>
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-[#1A0F2E]"><L en="Town / district" ml="സ്ഥലം / ജില്ല" /></span><input value={town} onChange={(e) => setTown(e.target.value)} maxLength={80} className={inputClass} /></label>
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-[#1A0F2E]"><L en="Instructions (optional)" ml="നിർദ്ദേശങ്ങൾ" /></span><input value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={500} placeholder={ml ? "ഉദാ: ഗേറ്റിനടുത്ത് വിളിക്കുക" : "e.g. Call at the gate"} className={inputClass} /></label>
            <div className="sm:col-span-2"><LocationPicker value={location} onChange={setLocation} /></div>
            <p className="text-xs text-muted-foreground sm:col-span-2"><L en="Your map location is optional. It helps us plan the visit; the inspection charge uses the verified road distance." ml="മാപ്പ് ലൊക്കേഷൻ ഐച്ഛികമാണ്." /></p>
          </div>
        ) : modeKind === "centre" ? (
          <div className="mt-5 flex flex-col gap-3">
            {sortedCentres.length === 0 ? <p className="text-sm text-muted-foreground"><L en="No service centres are open for booking right now. Please choose Home Service." ml="സർവീസ് സെന്ററുകൾ ഇപ്പോൾ ലഭ്യമല്ല." /></p> : null}
            {sortedCentres.map((c) => (
              <Card key={c.id} selected={centre === c.id} onClick={() => setCentre(c.id)} icon={MapPin} title={c.name} desc={c.address}>
                <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {c.dist != null ? <span>≈ {c.dist.toFixed(1)} km away</span> : null}
                  {c.working_hours ? <span className="inline-flex items-center gap-1"><Clock aria-hidden className="size-3" /> {c.working_hours}</span> : null}
                  {c.phone ? <span className="inline-flex items-center gap-1"><Phone aria-hidden className="size-3" /> {c.phone}</span> : null}
                </span>
              </Card>
            ))}
            <p className="text-xs text-muted-foreground"><L en="Our staff will attend to your product at the selected centre." ml="തിരഞ്ഞെടുത്ത സെന്ററിൽ ഞങ്ങളുടെ ജീവനക്കാർ സഹായിക്കും." /></p>
          </div>
        ) : null}
      </Section>

      <Section n={++n} title={<L en="Your details" ml="നിങ്ങളുടെ വിവരങ്ങൾ" />}>
        {known ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#F4EEFA] px-4 py-3 text-sm">
            <span><span className="font-semibold text-[#1A0F2E]">{defaults.name}</span> · {defaults.mobile}{defaults.code ? <span className="ml-2 font-mono text-xs text-[#4B0082]">{defaults.code}</span> : null}</span>
            <Link href="/account" className="font-semibold text-[#4B0082] hover:underline"><L en="Change" ml="മാറ്റുക" /></Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium"><L en="Name" ml="പേര്" /></span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={inputClass} /></label>
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium"><L en="Mobile number" ml="മൊബൈൽ നമ്പർ" /></span><input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" inputMode="tel" maxLength={20} autoComplete="tel" className={inputClass} /></label>
          </div>
        )}
      </Section>

      {error ? <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      <button type="submit" disabled={busy} className="inline-flex h-14 items-center justify-center gap-2 rounded-full px-8 text-base font-bold text-[#1A0F2E] shadow-[0_14px_34px_-14px_rgb(212_175_55/0.9)] disabled:opacity-60" style={{ background: "linear-gradient(135deg,#E8C964,#D4AF37)" }}>
        {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Wrench aria-hidden className="size-5" color={PURPLE} />}
        {busy ? (stage ?? "…") : <L en="Book service" ml="സർവീസ് ബുക്ക് ചെയ്യുക" />}
      </button>
    </form>
  );
}
