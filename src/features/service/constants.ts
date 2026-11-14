/** Service booking vocabulary (shared by server and client). Mirrors migration 20261114001500. */

export const SERVICE_CATEGORIES = [
  { value: "jeep", en: "Jeep / ride-on car", ml: "ജീപ്പ് / റൈഡ്-ഓൺ കാർ" },
  { value: "bike", en: "Bike", ml: "ബൈക്ക്" },
  { value: "scooter", en: "Scooter", ml: "സ്കൂട്ടർ" },
  { value: "cycle", en: "Cycle", ml: "സൈക്കിൾ" },
  { value: "toys", en: "Toys", ml: "കളിപ്പാട്ടങ്ങൾ" },
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]["value"];

export const SERVICE_STATUSES = [
  { value: "new", label: "New", ml: "പുതിയത്" },
  { value: "assigned", label: "Assigned", ml: "ഏൽപ്പിച്ചു" },
  { value: "accepted", label: "Accepted", ml: "സ്വീകരിച്ചു" },
  { value: "on_the_way", label: "On the way", ml: "വഴിയിൽ" },
  { value: "reached", label: "Reached location", ml: "സ്ഥലത്തെത്തി" },
  { value: "started", label: "Service started", ml: "സർവീസ് തുടങ്ങി" },
  { value: "completed", label: "Service completed", ml: "സർവീസ് പൂർത്തിയായി" },
  { value: "invoiced", label: "Invoice generated", ml: "ബിൽ തയ്യാർ" },
  { value: "cancelled", label: "Cancelled", ml: "റദ്ദാക്കി" },
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number]["value"];

export const statusLabel = (s: string) => SERVICE_STATUSES.find((x) => x.value === s)?.label ?? s;
export const categoryLabel = (c: string) => SERVICE_CATEGORIES.find((x) => x.value === c)?.en ?? c;

export const SERVICE_MEDIA_BUCKET = "service-media";
export const MAX_PHOTOS = 4;
export const MAX_VOICE_SECONDS = 120;

export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const directionsLink = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
