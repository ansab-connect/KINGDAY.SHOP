"use client";

import { ActionForm, FieldError } from "@/components/forms/action-form";
import { saveSystemSettingsAction } from "@/features/admin/actions";
import { SYSTEM_SETTINGS } from "@/features/admin/settings-keys";

const cls =
  "h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm";

export function SystemSettingsForm({ values }: { values: Record<string, string> }) {
  return (
    <ActionForm action={saveSystemSettingsAction} submitLabel="Save system settings">
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(SYSTEM_SETTINGS).map(([key, def]) => (
            <label key={key} className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-deep">{def.label}</span>
              {def.kind === "choice" ? (
                <select name={key} defaultValue={values[key] ?? def.fallback} className={cls}>
                  {def.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input name={key} type="number" min={def.min} max={def.max} step={1} inputMode="numeric" defaultValue={values[key] ?? String(def.fallback)} className={cls} />
              )}
              <FieldError state={state} name={key} />
            </label>
          ))}
        </div>
      )}
    </ActionForm>
  );
}
