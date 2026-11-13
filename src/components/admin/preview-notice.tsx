import { FlaskConical } from "lucide-react";

/** Shown on every screen that renders development preview data. */
export function PreviewNotice({ phase }: { phase?: number }) {
  return (
    <div
      role="note"
      className="mb-6 flex items-start gap-3 rounded-xl border border-gold-300/60 bg-gold-50 px-4 py-3 text-sm text-gold-800"
    >
      <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-600" />
      <p>
        <span className="font-semibold">Preview data.</span> These figures are fictional, used for
        design only. Live data connects once Supabase is set up
        {phase ? ` and this module is built (Phase ${phase})` : " (Phase 4)"}.
      </p>
    </div>
  );
}
