/**
 * Mobile numbers are stored as typed and matched in E.164 form (+919876543210).
 * Same rules as private.normalize_mobile() in the database.
 */
export function normalizeMobile(input: string): string | null {
  const d = input.replace(/\D/g, "").replace(/^0+/, "");
  if (/^[6-9]\d{9}$/.test(d)) return `+91${d}`;
  if (/^91[6-9]\d{9}$/.test(d)) return `+${d}`;
  if (/^[1-9]\d{9,14}$/.test(d)) return `+${d}`;
  return null;
}

/** Display form saved on the profile, e.g. "+91 98765 43210". */
export function formatMobile(e164: string): string {
  const m = e164.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/** Sign-in address for customers who register with a mobile number only. Never emailed. */
export const mobileLoginEmail = (e164: string) => `m${e164.replace(/\D/g, "")}@customers.kingday.in`;
export const isMobileLoginEmail = (email: string | null | undefined) => Boolean(email?.endsWith("@customers.kingday.in"));
