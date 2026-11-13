/**
 * Storefront copy and links. Marketing claims here must be reviewed by KING DAY
 * before launch. Contact details are left empty until the store provides them,
 * and empty values are simply not rendered.
 */
export const storeNav = [
  { title: "Home", href: "/" },
  { title: "Shop", href: "/shop" },
  { title: "Categories", href: "/categories" },
  { title: "Offers", href: "/offers" },
  { title: "About Us", href: "/about" },
  { title: "Contact", href: "/contact" },
] as const;

export const storeContact = {
  email: process.env.NEXT_PUBLIC_STORE_EMAIL ?? "",
  phone: process.env.NEXT_PUBLIC_STORE_PHONE ?? "",
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "",
  address: process.env.NEXT_PUBLIC_STORE_ADDRESS ?? "",
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
    title: "Secure payments",
    body: "Pay online through Razorpay, or choose cash on delivery where available.",
  },
  {
    icon: "chat",
    title: "Real people on WhatsApp",
    body: "Not sure which model or size? Talk to us before you buy, and after.",
  },
] as const;

/** Build a WhatsApp deep link. Returns null when no store number is configured. */
export function whatsappLink(message: string): string | null {
  const digits = storeContact.whatsapp.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
