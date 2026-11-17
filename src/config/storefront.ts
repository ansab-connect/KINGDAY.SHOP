/**
 * Storefront copy and links. Marketing claims here must be reviewed by KING DAY
 * before launch. Official contact details are the defaults below; an env var
 * overrides one only when it is set to a non-empty value.
 */
export const storeNav = [
  { title: "Home", ml: "ഹോം", href: "/" },
  { title: "Shop", ml: "ഷോപ്പ്", href: "/shop" },
  { title: "Categories", ml: "വിഭാഗം", href: "/categories" },
  { title: "Offers", ml: "ഓഫറുകൾ", href: "/offers" },
  { title: "About", ml: "ഞങ്ങൾ", href: "/about" },
  { title: "Contact", ml: "ബന്ധപ്പെടുക", href: "/contact" },
] as const;

/** Official KING DAY contact details. */
export const OFFICIAL_SUPPORT_EMAIL = "kingdaystore@gmail.com";
export const OFFICIAL_WHATSAPP = "919495902904";
export const OFFICIAL_WHATSAPP_DISPLAY = "+91 94959 02904";
export const OFFICE_LOCATION = "KOZHIKKODE PUTHIYAPALAM OFFICE";

export const storeContact = {
  email: process.env.NEXT_PUBLIC_STORE_EMAIL || OFFICIAL_SUPPORT_EMAIL,
  phone: process.env.NEXT_PUBLIC_STORE_PHONE || "",
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || OFFICIAL_WHATSAPP,
  whatsappDisplay: OFFICIAL_WHATSAPP_DISPLAY,
  address: process.env.NEXT_PUBLIC_STORE_ADDRESS || OFFICE_LOCATION,
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_HANDLE ?? "",
  facebook: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? "",
  youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL ?? "",
};

export const whyChoose = [
  {
    icon: "shield",
    title: "Safety first",
    body: "Every ride is chosen for sturdy build, child-safe materials and thoughtful safety features.",
  },
  {
    icon: "check",
    title: "Inspected before dispatch",
    body: "Each order is checked by our team before it leaves, so it arrives ready for the first ride.",
  },
  {
    icon: "lock",
    title: "Pay on delivery",
    body: "Pay cash when your order arrives. Our team calls you first to confirm the delivery date.",
  },
  {
    icon: "chat",
    title: "Real people on WhatsApp",
    body: "Not sure which model or size? Talk to us before you buy, and after.",
  },
] as const;

export const supportMailto = (subject?: string) =>
  `mailto:${storeContact.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;

/** Build a WhatsApp deep link. Returns null when no store number is configured. */
export function whatsappLink(message: string): string | null {
  const digits = storeContact.whatsapp.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
