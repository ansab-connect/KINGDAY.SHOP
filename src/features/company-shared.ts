import { OFFICE_LOCATION, OFFICIAL_SUPPORT_EMAIL, OFFICIAL_WHATSAPP, storeContact } from "@/config/storefront";

/** Company details edited by the Super Admin (Admin → Company Details). */
export type Company = {
  name: string;
  division: string;
  gstin: string;
  phone: string;
  email: string;
  /** Digits with country code, e.g. 919495902904. */
  whatsapp: string;
  /** "+91 94959 02904". */
  whatsappDisplay: string;
  address: string;
  logo_url: string;
  terms: string;
  payment_instructions: string;
  instagram: string;
  facebook: string;
  youtube: string;
};

export const displayWa = (d: string) => (/^91\d{10}$/.test(d) ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : `+${d}`);

/** Built-in values, used until the Super Admin saves the profile (and if the database is down). */
export function companyFallback(): Company {
  const wa = storeContact.whatsapp.replace(/\D/g, "") || OFFICIAL_WHATSAPP;
  return {
    name: "KING DAY", division: "", gstin: "", phone: storeContact.phone || displayWa(wa), email: storeContact.email || OFFICIAL_SUPPORT_EMAIL,
    whatsapp: wa, whatsappDisplay: displayWa(wa), address: storeContact.address || OFFICE_LOCATION, logo_url: "", terms: "", payment_instructions: "",
    instagram: storeContact.instagram, facebook: storeContact.facebook, youtube: storeContact.youtube,
  };
}

