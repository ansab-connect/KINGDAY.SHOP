"use client";

import { useState, useTransition } from "react";
import { LocateFixed, Loader2, MapPin } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { findPlaceAction } from "@/features/best-fit/geocode";
import { runOp, type OpResult } from "@/features/best-fit/ops";
import { Notice } from "./op-form";

type Base = { label?: string; pin?: string; lat: number | null; lng: number | null };

/** Shop location for road distances: one tap at the shop ("use this phone's location"), or type it. */
export function BaseLocationForm({ initial }: { initial: Base }) {
  const [label, setLabel] = useState(initial.label ?? "");
  const [lat, setLat] = useState(initial.lat != null ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial.lng != null ? String(initial.lng) : "");
  const [pin, setPin] = useState(initial.pin ?? "");
  const [finding, startFind] = useTransition();

  function findPin() {
    startFind(async () => {
      const r = await findPlaceAction({ pin, place: label });
      if (!r.ok) return setRes({ ok: false, error: r.error });
      setLat(String(r.lat));
      setLng(String(r.lng));
      if (!label) setLabel(r.label);
      setRes({ ok: true, message: `Found: ${r.label}. Press Save.` });
    });
  }
  const [res, setRes] = useState<OpResult | null>(null);
  const [locating, setLocating] = useState(false);
  const [pending, start] = useTransition();

  function locate() {
    if (!navigator.geolocation) return setRes({ ok: false, error: "This browser can't share location. Type the numbers instead." });
    setLocating(true);
    // Keep watching up to 15 s and use the most accurate GPS reading (the first one is often rough).
    let best: GeolocationPosition | null = null;
    const finish = () => {
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      setLocating(false);
      if (!best) return setRes({ ok: false, error: "Location permission was not given. Allow it, or use the PIN code." });
      setLat(best.coords.latitude.toFixed(6));
      setLng(best.coords.longitude.toFixed(6));
      const acc = Math.round(best.coords.accuracy);
      setRes(acc > 100 ? { ok: false, error: `Only a rough location (about ${acc} m). Turn on GPS and try outside, or use the PIN code.` } : { ok: true, message: `Location found (accuracy about ${acc} m). Press Save.` });
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
        if (p.coords.accuracy <= 20) finish();
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) finish();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    const timer = setTimeout(finish, 15000);
  }

  function save() {
    const a = Number(lat), b = Number(lng);
    if (!lat || !lng || !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return setRes({ ok: false, error: "Enter a valid latitude and longitude." });
    start(async () => setRes(await runOp("setting.save", { key: "best_fit.base_location", value: { label, pin, lat: a, lng: b } })));
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={locate} disabled={locating} className="inline-flex h-11 w-fit items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
        {locating ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <LocateFixed aria-hidden className="size-4" />} Use my current location (stand at the shop)
      </button>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-deep">Shop PIN code</span><input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="673002" className={`${inputClass} w-36`} /></label>
        <button type="button" onClick={findPin} disabled={finding || pin.length !== 6} className="inline-flex h-11 items-center gap-2 rounded-lg border border-royal-200 px-4 text-sm font-semibold text-royal hover:bg-royal-50 disabled:opacity-60">
          {finding ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <MapPin aria-hidden className="size-4" />} Find by PIN code
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm sm:col-span-3"><span className="font-medium text-deep">Address</span><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} className={inputClass} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-deep">Latitude</span><input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" className={inputClass} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-deep">Longitude</span><input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" className={inputClass} /></label>
        <div className="flex items-end"><button type="button" onClick={save} disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-lg bg-gold px-5 text-sm font-semibold text-deep disabled:opacity-60">{pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null} Save</button></div>
      </div>
      <p className="text-xs text-muted-foreground">Tip: in Google Maps, long-press the shop; the two numbers shown at the top are latitude, longitude.</p>
      <Notice r={res} />
    </div>
  );
}
