export const siteConfig = {
  name: "KING DAY",
  legalName: "KING DAY",
  /** Operating company (payslips, invoices, footer credit). */
  company: "MOTHERBITS TECHNOLOGIES LLP",
  tagline: "Every child deserves a royal ride.",
  description:
    "Premium kids' electric jeeps, cars, bikes, scooters, tricycles, bicycles, toys and baby accessories. Every child deserves a royal ride.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kingday.in",
  locale: "en_IN",
  currency: "INR",
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "",
  /** Static year (Cache Components disallows reading the clock during prerender). */
  copyrightYear: 2026,
} as const;

/** Official brand colours — mirror of the CSS tokens in globals.css. */
export const brandColors = {
  royalPurple: "#4B0082",
  matteGold: "#D4AF37",
  deepPurple: "#1A0F2E",
  white: "#FFFFFF",
} as const;

export const productCategories = [
  { slug: "electric-jeeps-cars", name: "Electric Jeeps & Cars" },
  { slug: "bikes", name: "Bikes" },
  { slug: "scooters", name: "Scooters" },
  { slug: "tricycles", name: "Tricycles" },
  { slug: "cycles", name: "Cycles" },
  { slug: "toys", name: "Toys" },
  { slug: "baby-accessories", name: "Baby Accessories" },
] as const;
