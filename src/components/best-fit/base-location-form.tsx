"use client";

import { useState, useTransition } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { runOp, type OpResult } from "@/features/best-fit/ops";
import { Notice } from "./op-form";

type Base = { label?: string; lat: number | null; lng: number | null };

/** Shop location for road distances: one tap at the shop ("use this phone's location"), or type it. */
export function BaseLocationForm({ initial }: { initial: Base }) {
  const [label, setLabel] = useState(initial.label ?? "");
  const [lat, setLat] = useState(initial.lat != null ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial.lng != null ? String(initial.lng) : "");
  const [res, setRes] = useState<OpResult | null>(null);
  const [locating, setLocating] = useState(false);
  const [pending, start] = useTransition();

  function locate() {
    if (!navigator.geolocation) return setRes({ ok: false, error: "This browser can't share location. Type the numbers instead." });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
        setLocating(false);
        setRes({ ok: true, message: `Location found (accuracy about ${Math.round(p.coords.accuracy)} m). Press Save.` });
      },
      () => {
        setLocating(false);
        setRes({ ok: false, error: "Location permission was not given. Allow it, or type the numbers." });
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }

  function save() {
    const a = Number(lat), b = Number(lng);
    if (!lat || !lng || !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return setRes({ ok: false, error: "Enter a valid latitude and longitude." });
    start(async () => setRes(await runOp("setting.save", { key: "best_fit.base_location", value: { label, lat: a, lng: b } })));
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={locate} disabled={locating} className="inline-flex h-11 w-fit items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
        {locating ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <LocateFixed aria-hidden className="size-4" />} Use my current location (stand at the shop)
      </button>
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
