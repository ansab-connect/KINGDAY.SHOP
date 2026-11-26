/** Service booking vocabulary (shared by server and client). Mirrors migration 20261114001500. */

/** Default labels only. The live list is the service_categories table (features/service/catalog.ts). */
export const SERVICE_CATEGORIES = [
  { value: "jeep", en: "Jeep / ride-on car", ml: "ജീപ്പ് / റൈഡ്-ഓൺ കാർ" },
  { value: "bike", en: "Bike", ml: "ബൈക്ക്" },
  { value: "scooter", en: "Scooter", ml: "സ്കൂട്ടർ" },
  { value: "cycle", en: "Cycle", ml: "സൈക്കിൾ" },
  { value: "toys", en: "Toys", ml: "കളിപ്പാട്ടങ്ങൾ" },
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]["value"];

export const SERVICE_STATUSES = [
  { value: "new", label: "Booking received", ml: "ബുക്കിംഗ് ലഭിച്ചു" },
  { value: "assigned", label: "Assigned", ml: "ഏൽപ്പിച്ചു" },
  { value: "scheduled", label: "Scheduled", ml: "സമയം നിശ്ചയിച്ചു" },
  { value: "accepted", label: "Accepted", ml: "സ്വീകരിച്ചു" },
  { value: "on_the_way", label: "On the way", ml: "വഴിയിൽ" },
  { value: "reached", label: "Arrived", ml: "സ്ഥലത്തെത്തി" },
  { value: "inspection_started", label: "Inspection started", ml: "പരിശോധന തുടങ്ങി" },
  { value: "inspection_completed", label: "Inspection completed", ml: "പരിശോധന പൂർത്തിയായി" },
  { value: "started", label: "Work in progress", ml: "ജോലി നടക്കുന്നു" },
  { value: "awaiting_parts", label: "Awaiting parts", ml: "പാർട്സിനായി കാത്തിരിക്കുന്നു" },
  { value: "completed", label: "Service completed", ml: "സർവീസ് പൂർത്തിയായി" },
  { value: "ready_for_delivery", label: "Ready for delivery", ml: "ഡെലിവറിക്ക് തയ്യാർ" },
  { value: "invoiced", label: "Invoice generated", ml: "ബിൽ തയ്യാർ" },
  { value: "cancelled", label: "Cancelled", ml: "റദ്ദാക്കി" },
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number]["value"];

/** Readable fallback for slugs added later in the catalog (e.g. "baby-walker" → "Baby walker"). */
export const humanize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]+/g, " ") : s);
export const statusLabel = (s: string) => SERVICE_STATUSES.find((x) => x.value === s)?.label ?? humanize(s);
export const categoryLabel = (c: string) => SERVICE_CATEGORIES.find((x) => x.value === c)?.en ?? humanize(c);

export const SERVICE_MEDIA_BUCKET = "service-media";
export const MAX_PHOTOS = 8;
export const MAX_VOICE_SECONDS = 120;

export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const directionsLink = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export const SERVICE_TYPES = [
  { value: "repair", en: "Repair", ml: "റിപ്പയർ" },
  { value: "general_service", en: "General service", ml: "ജനറൽ സർവീസ്" },
  { value: "battery", en: "Battery / charging", ml: "ബാറ്ററി / ചാർജിംഗ്" },
  { value: "installation", en: "Assembly / installation", ml: "അസംബ്ലി / ഇൻസ്റ്റലേഷൻ" },
  { value: "inspection", en: "Inspection / check-up", ml: "പരിശോധന" },
  { value: "other", en: "Other", ml: "മറ്റുള്ളവ" },
] as const;
export const serviceTypeLabel = (v: string) => SERVICE_TYPES.find((t) => t.value === v)?.en ?? humanize(v);

export const PREFERRED_TIMES = [
  { value: "morning", en: "Morning (9–12)", ml: "രാവിലെ (9–12)" },
  { value: "afternoon", en: "Afternoon (12–4)", ml: "ഉച്ചയ്ക്ക് (12–4)" },
  { value: "evening", en: "Evening (4–7)", ml: "വൈകുന്നേരം (4–7)" },
] as const;
export const preferredTimeLabel = (v: string | null | undefined) => PREFERRED_TIMES.find((t) => t.value === v)?.en ?? "Any time";

/** Bookings are inspection-first, so the preferred date may be empty. */
export const preferredDateText = (d: string | null | undefined) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Inspection first";
