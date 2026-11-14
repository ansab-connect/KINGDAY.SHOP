import type { z } from "zod";

/** State returned by every form-bound server action. */
export type FormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Extra values for the client (e.g. a one-time setup link). */
  data?: Record<string, string>;
  /** Changes on every submit so the client can re-show a repeated notice. */
  at?: number;
};

export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

export const ok = (message: string): FormState => ({ ok: true, message, at: Date.now() });
export const fail = (error: string, fieldErrors?: Record<string, string>): FormState => ({ ok: false, error, fieldErrors, at: Date.now() });

/** Map a Postgres/PostgREST error to a message that's safe to show. */
export function dbMessage(e: { code?: string; message: string }, fallback: string): string {
  switch (e.code) {
    case "42501":
      return "You don't have permission to do that.";
    case "23514":
    case "22023":
      return /status change/i.test(e.message) ? "That status change isn't allowed from the order's current status." : "Some values aren't allowed. Please check and try again.";
    case "23505":
      return "That already exists.";
    case "P0002":
      return "That record no longer exists.";
    default:
      return /insufficient|negative|on_hand/i.test(e.message) ? "Not enough stock for that change." : fallback;
  }
}
