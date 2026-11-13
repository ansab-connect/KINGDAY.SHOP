import { Database } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/env";

/** Shown on editors while Supabase is not connected: the form works, saving doesn't. */
export function PreviewSaveNotice() {
  if (isSupabaseConfigured) return null;
  return (
    <div role="note" className="mb-6 flex items-start gap-3 rounded-xl border border-gold-300/60 bg-gold-50 px-4 py-3 text-sm text-gold-800">
      <Database aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-600" />
      <p>
        <span className="font-semibold">Preview mode.</span> You can try this form, but saving and uploads are disabled
        until Supabase is connected (see <code className="font-mono text-xs">docs/SUPABASE_SETUP.md</code>).
      </p>
    </div>
  );
}
