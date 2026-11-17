"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, Camera, CheckCircle2, Loader2, ShoppingCart, X } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { L } from "@/components/i18n/lang";
import { useLang } from "@/components/i18n/language-switcher";
import { useRouter } from "next/navigation";
import { addToServiceCartAction, createServiceBookingAction } from "@/features/service/actions";
import { MAX_PHOTOS, SERVICE_MEDIA_BUCKET } from "@/features/service/constants";
import { optimizeImage, randomFileId } from "@/lib/image-optimize";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LocationPicker, type LatLng } from "./location-picker";
import { VoiceRecorder, type VoiceNote } from "./voice-recorder";

export type Purchase = { key: string; orderId: string; orderNumber: string; productName: string; placedAt: string };
type Defaults = { name: string; mobile: string; email: string; address: string; code: string };
/** Catalog choices from the database (Admin → Service Management → Catalog). */
export type CatalogChoice = { slug: string; name: string; name_ml: string | null; parent?: string | null };
export type BookingOption = { slug: string; title: string; title_ml: string | null; defaultType: string | null };

function Field({ label, error, required, hint, className, children }: { label: React.ReactNode; error?: string; required?: boolean; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-deep">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-card sm:p-6">
      <h2 className="mb-4 flex items-center gap-3 font-heading text-lg font-semibold text-deep">
        <span className="grid size-7 place-items-center rounded-full bg-royal text-sm text-white">{n}</span>
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}


export function BookingForm({
  userId,
  defaults,
  purchases,
  option,
  categories,
  types,
}: {
  userId: string;
  defaults: Defaults;
  purchases: Purchase[];
  option: BookingOption;
  categories: CatalogChoice[];
  types: CatalogChoice[];
}) {
  const ml = useLang() === "ml";
  const router = useRouter();
  const known = Boolean(defaults.name && defaults.mobile);
  const [serviceType, setServiceType] = useState(option.defaultType && types.some((t) => t.slug === option.defaultType) ? option.defaultType : (types[0]?.slug ?? "repair"));
  const [name, setName] = useState(defaults.name);
  const [mobile, setMobile] = useState(defaults.mobile);
  const [email, setEmail] = useState(defaults.email);
  const [category, setCategory] = useState("");
  const [source, setSource] = useState<"kingday" | "external">(purchases.length ? "kingday" : "external");
  const [purchaseKey, setPurchaseKey] = useState("");
  const [productName, setProductName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseDetails, setPurchaseDetails] = useState("");
  const [complaint, setComplaint] = useState("");
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [address, setAddress] = useState(defaults.address);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  const purchase = purchases.find((p) => p.key === purchaseKey);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = [...photos];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_PHOTOS) break;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) continue;
      next.push({ file: f, url: URL.createObjectURL(f) });
    }
    setPhotos(next);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const toCart = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "cart";
    setBusy(true);
    setError(null);
    setFe({});
    try {
      const storage = createClient().storage.from(SERVICE_MEDIA_BUCKET);
      const photoPaths: string[] = [];
      for (const p of photos) {
        const img = await optimizeImage(p.file, 1600);
        const path = `${userId}/${randomFileId()}.${img.extension}`;
        const { error: upErr } = await storage.upload(path, img.blob, { contentType: img.blob.type, upsert: false });
        if (upErr) throw new Error("Photo upload failed. Please try again.");
        photoPaths.push(path);
      }
      let voicePath = "";
      if (voice) {
        const path = `${userId}/voice-${randomFileId()}.${voice.ext}`;
        const { error: upErr } = await storage.upload(path, voice.blob, { contentType: voice.blob.type, upsert: false });
        if (upErr) throw new Error("Voice note upload failed. Please try again.");
        voicePath = path;
      }
      const payload = {
        customer_name: name,
        mobile,
        email,
        category,
        purchase_source: source,
        order_id: source === "kingday" ? (purchase?.orderId ?? "") : "",
        product_name: source === "kingday" ? (purchase?.productName ?? "") : productName,
        purchase_date: source === "kingday" ? (purchase?.placedAt.slice(0, 10) ?? "") : purchaseDate,
        purchase_details: source === "kingday" && purchase ? `KING DAY order ${purchase.orderNumber}` : purchaseDetails,
        complaint,
        voice_path: voicePath,
        photo_paths: photoPaths,
        address,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        preferred_date: "",
        booking_kind: option.slug,
        service_type: serviceType,
        preferred_time: "",
      };
      const res = toCart ? await addToServiceCartAction(payload) : await createServiceBookingAction(payload);
      if (res.ok && toCart) {
        router.push("/cart?tab=services");
        return;
      }
      if (res.ok) {
        setDone(res.code);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError(res.error);
        setFe(res.fieldErrors ?? {});
        if (res.fieldErrors?.order_id || res.fieldErrors?.product_name) setFe((f) => ({ ...f, product: res.fieldErrors?.order_id ?? res.fieldErrors?.product_name ?? "" }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border bg-white p-8 text-center shadow-card">
        <CheckCircle2 aria-hidden className="size-12 text-success" />
        <h2 className="text-2xl font-bold text-deep"><L en="Service booked" ml="സർവീസ് ബുക്ക് ചെയ്തു" /></h2>
        <p className="text-sm text-muted-foreground"><L en="Your booking ID" ml="നിങ്ങളുടെ ബുക്കിംഗ് ഐഡി" /></p>
        <p className="rounded-xl bg-royal-50 px-5 py-3 font-mono text-2xl font-bold tracking-wider text-royal">{done}</p>
        <p className="text-sm text-muted-foreground">
          <L en="Our team will call you to confirm the visit. Keep this ID for reference." ml="സന്ദർശനം ഉറപ്പിക്കാൻ ഞങ്ങൾ നിങ്ങളെ വിളിക്കും. ഈ ഐഡി സൂക്ഷിക്കുക." />
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/account/service" className="inline-flex h-11 items-center rounded-full bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800"><L en="My service bookings" ml="എന്റെ ബുക്കിംഗുകൾ" /></Link>
          <Link href="/" className="inline-flex h-11 items-center rounded-full border px-5 text-sm font-semibold text-deep hover:bg-muted"><L en="Back to home" ml="ഹോമിലേക്ക്" /></Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Step n={1} title={<L en="Your details" ml="നിങ്ങളുടെ വിവരങ്ങൾ" />}>
        {known ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-royal-50 px-4 py-3 text-sm sm:col-span-2">
            <span>
              <span className="font-semibold text-deep">{defaults.name}</span> · {defaults.mobile}
              {defaults.code ? <span className="ml-2 font-mono text-xs text-royal">{defaults.code}</span> : null}
            </span>
            <Link href="/account" className="text-sm font-semibold text-royal hover:underline"><L en="Change" ml="മാറ്റുക" /></Link>
          </div>
        ) : (
          <>
        <Field label={<L en="Name" ml="പേര്" />} required error={fe.customer_name}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={inputClass} />
        </Field>
        <Field label={<L en="Mobile number" ml="മൊബൈൽ നമ്പർ" />} required error={fe.mobile}>
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" inputMode="tel" maxLength={20} autoComplete="tel" placeholder="+91 94959 02904" className={inputClass} />
        </Field>
        <Field label={<L en="Email (optional)" ml="ഇമെയിൽ (ഐച്ഛികം)" />} error={fe.email} className="sm:col-span-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" maxLength={254} autoComplete="email" className={inputClass} />
        </Field>
          </>
        )}
      </Step>

      <Step n={2} title={<L en="Product" ml="ഉൽപ്പന്നം" />}>
        <Field label={<L en="Category" ml="വിഭാഗം" />} required error={fe.category} className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                aria-pressed={category === c.slug}
                onClick={() => setCategory(c.slug)}
                className={cn("h-10 rounded-full border px-4 text-sm font-semibold", category === c.slug ? "border-royal bg-royal text-white" : "bg-white text-deep hover:border-royal-300")}
              >
                <L en={c.name} ml={c.name_ml ?? c.name} />
              </button>
            ))}
          </div>
        </Field>
        <Field label={<L en="Service needed" ml="ആവശ്യമായ സർവീസ്" />} className="sm:col-span-2">
          <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} className={inputClass}>
            {types.map((t) => <option key={t.slug} value={t.slug}>{ml && t.name_ml ? t.name_ml : t.name}</option>)}
          </select>
        </Field>
        <Field label={<L en="Where did you buy it?" ml="എവിടെ നിന്നാണ് വാങ്ങിയത്?" />} className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {([["kingday", "From KING DAY", "KING DAY-ൽ നിന്ന്"], ["external", "Bought elsewhere", "മറ്റെവിടെ നിന്നോ"]] as const).map(([v, en, mlText]) => (
              <button
                key={v}
                type="button"
                aria-pressed={source === v}
                onClick={() => setSource(v)}
                className={cn("h-10 rounded-full border px-4 text-sm font-semibold", source === v ? "border-royal bg-royal-50 text-royal" : "bg-white text-deep")}
              >
                <L en={en} ml={mlText} />
              </button>
            ))}
          </div>
        </Field>
        {source === "kingday" ? (
          purchases.length ? (
            <Field label={<L en="Choose your purchase" ml="നിങ്ങളുടെ പർച്ചേസ് തിരഞ്ഞെടുക്കുക" />} required error={fe.product} className="sm:col-span-2">
              <select value={purchaseKey} onChange={(e) => setPurchaseKey(e.target.value)} className={inputClass}>
                <option value="">{ml ? "തിരഞ്ഞെടുക്കുക…" : "Choose…"}</option>
                {purchases.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.productName} · {p.orderNumber} · {new Date(p.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              <L en="We couldn't find KING DAY orders on your account. Choose “Bought elsewhere” and type the product name." ml="നിങ്ങളുടെ അക്കൗണ്ടിൽ ഓർഡറുകൾ കണ്ടെത്തിയില്ല. “മറ്റെവിടെ നിന്നോ” തിരഞ്ഞെടുക്കൂ." />
            </p>
          )
        ) : (
          <>
            <Field label={<L en="Product name" ml="ഉൽപ്പന്നത്തിന്റെ പേര്" />} required error={fe.product_name ?? fe.product} className="sm:col-span-2">
              <input value={productName} onChange={(e) => setProductName(e.target.value)} maxLength={200} placeholder={ml ? "ഉദാ: 12V ഇലക്ട്രിക് ജീപ്പ്" : "e.g. 12V electric jeep, red"} className={inputClass} />
            </Field>
            <Field label={<L en="Purchase date" ml="വാങ്ങിയ തീയതി" />}>
              <input value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} type="date" max={new Date().toISOString().slice(0, 10)} className={inputClass} />
            </Field>
            <Field label={<L en="Shop / bill details" ml="കട / ബിൽ വിവരം" />}>
              <input value={purchaseDetails} onChange={(e) => setPurchaseDetails(e.target.value)} maxLength={500} className={inputClass} />
            </Field>
          </>
        )}
        <Field label={<L en="Product photos (up to 4)" ml="ഉൽപ്പന്ന ഫോട്ടോകൾ (4 വരെ)" />} className="sm:col-span-2">
          <div className="flex flex-wrap gap-3">
            {photos.map((p, i) => (
              <div key={p.url} className="relative size-20 overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview before upload */}
                <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label="Remove photo" className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-deep/70 text-white">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <label className="grid size-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed text-muted-foreground hover:border-royal-300 hover:text-royal">
                <Camera aria-hidden className="size-6" />
                <span className="sr-only">Add photos</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              </label>
            ) : null}
          </div>
        </Field>
      </Step>

      <Step n={3} title={<L en="The problem" ml="പ്രശ്നം" />}>
        <Field label={<L en="Describe the problem" ml="പ്രശ്നം വിവരിക്കുക" />} error={fe.complaint} className="sm:col-span-2" hint={<L en="Type it, record a voice note, or both." ml="ടൈപ്പ് ചെയ്യുക, അല്ലെങ്കിൽ ശബ്ദ സന്ദേശം റെക്കോർഡ് ചെയ്യുക." />}>
          <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={4} maxLength={3000} placeholder={ml ? "ഉദാ: ബാറ്ററി ചാർജ് ആകുന്നില്ല" : "e.g. Battery not charging, left wheel noise"} className={cn(inputClass, "h-auto py-2")} />
        </Field>
        <div className="sm:col-span-2">
          <VoiceRecorder value={voice} onChange={setVoice} />
        </div>
      </Step>

      <Step n={4} title={<L en="Where" ml="എവിടെ" />}>
        <Field label={<L en="Service address" ml="സർവീസ് വിലാസം" />} required error={fe.address} className="sm:col-span-2">
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} maxLength={500} autoComplete="street-address" className={cn(inputClass, "h-auto py-2")} />
        </Field>
        <div className="sm:col-span-2">
          <LocationPicker value={location} onChange={setLocation} />
        </div>
        <p className="text-sm text-muted-foreground sm:col-span-2">
          <L en="No need to pick a date: we inspect first, then call you to fix a convenient time." ml="തീയതി തിരഞ്ഞെടുക്കേണ്ട: ആദ്യം പരിശോധിച്ച ശേഷം സൗകര്യപ്രദമായ സമയം വിളിച്ച് ഉറപ്പിക്കും." />
        </p>
      </Step>

      {error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" value="book" disabled={busy} className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-gold px-8 text-base font-bold text-deep shadow-[0_14px_34px_-14px_rgb(212_175_55/0.9)] hover:bg-gold-300 disabled:opacity-60">
          {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <CalendarCheck aria-hidden className="size-5" />}
          <L en="Book service now" ml="ഇപ്പോൾ ബുക്ക് ചെയ്യുക" />
        </button>
        <button type="submit" value="cart" disabled={busy} className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-royal-200 bg-white px-6 text-sm font-semibold text-royal hover:bg-royal-50 disabled:opacity-60">
          <ShoppingCart aria-hidden className="size-5" />
          <L en="Add to service cart" ml="സർവീസ് കാർട്ടിൽ ചേർക്കുക" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground"><L en="Booking several things? Add each to the service cart and book them together." ml="ഒന്നിലധികം സർവീസുകൾ കാർട്ടിൽ ചേർത്ത് ഒരുമിച്ച് ബുക്ക് ചെയ്യാം." /></p>
    </form>
  );
}
