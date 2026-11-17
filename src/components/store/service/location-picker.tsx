"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { L as Tr } from "@/components/i18n/lang";
import { mapsLink } from "@/features/service/constants";

export type LatLng = { lat: number; lng: number };

const KOZHIKODE: LatLng = { lat: 11.2588, lng: 75.7804 };
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Free map picker (OpenStreetMap + Leaflet): tap the map or drag the pin,
 * or use the phone's location. The saved point opens in Google Maps for the technician.
 */
export function LocationPicker({ value, onChange }: { value: LatLng | null; onChange: (v: LatLng | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current || map.current) return;
      const start = value ?? KOZHIKODE;
      const m = L.map(box.current, { scrollWheelZoom: false }).setView([start.lat, start.lng], value ? 16 : 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        // New tab, so a stray tap never leaves the half-filled form.
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      }).addTo(m);
      m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#4B0082;border:3px solid #D4AF37;transform:rotate(-45deg);box-shadow:0 4px 10px rgba(0,0,0,.3)"></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      const place = (p: LatLng) => {
        if (!marker.current) {
          marker.current = L.marker([p.lat, p.lng], { icon, draggable: true }).addTo(m);
          marker.current.on("dragend", () => {
            const ll = marker.current!.getLatLng();
            onChangeRef.current({ lat: round(ll.lat), lng: round(ll.lng) });
          });
        } else marker.current.setLatLng([p.lat, p.lng]);
      };
      if (value) place(value);
      m.on("click", (e) => {
        const p = { lat: round(e.latlng.lat), lng: round(e.latlng.lng) };
        place(p);
        onChangeRef.current(p);
      });
      map.current = m;
      (m as unknown as { __place: (p: LatLng) => void }).__place = place;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Location isn't available on this device. Tap the map instead.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) };
        onChange(p);
        const m = map.current as unknown as (LeafletMap & { __place?: (p: LatLng) => void }) | null;
        m?.__place?.(p);
        m?.setView([p.lat, p.lng], 17);
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Allow location access, or tap the map.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={useMyLocation} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-deep hover:bg-muted">
          {locating ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Crosshair aria-hidden className="size-4" />}
          <Tr en="Use my current location" ml="എന്റെ ഇപ്പോഴത്തെ ലൊക്കേഷൻ" />
        </button>
        {value ? (
          <a href={mapsLink(value.lat, value.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-royal hover:underline">
            <MapPin aria-hidden className="size-4" /> <Tr en="Check on Google Maps" ml="Google Maps-ൽ കാണുക" />
          </a>
        ) : null}
        {value ? (
          <button type="button" onClick={() => { onChange(null); marker.current?.remove(); marker.current = null; }} className="text-sm text-muted-foreground underline">
            <Tr en="Clear" ml="മായ്ക്കുക" />
          </button>
        ) : null}
      </div>
      <div ref={box} className="relative z-0 h-64 w-full overflow-hidden rounded-xl border bg-muted sm:h-72" role="application" aria-label="Map: tap to set the service location" />
      <p className="text-xs text-muted-foreground">
        {error ?? <Tr en="Tap the map or drag the pin to your exact location (optional, helps the technician)." ml="മാപ്പിൽ തൊട്ട് കൃത്യമായ സ്ഥലം തിരഞ്ഞെടുക്കൂ (ഐച്ഛികം)." />}
      </p>
    </div>
  );
}
