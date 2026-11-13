"use client";

import { ActionForm, FieldError } from "@/components/forms/action-form";
import { saveSettingsAction } from "@/features/admin/actions";
import { EDITABLE_SETTINGS } from "@/features/admin/settings-keys";

const cls =
  "h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm";

/** Values arrive already converted for display (rupees, not paise). */
export function SettingsForm({ values, disabled }: { values: Record<string, string | boolean>; disabled?: boolean }) {
  return (
    <ActionForm action={saveSettingsAction} submitLabel="Save settings">
      {(state) => (
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
          {Object.entries(EDITABLE_SETTINGS).map(([key, def]) =>
            def.kind === "boolean" ? (
              <label key={key} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
                <input type="checkbox" name={key} defaultChecked={values[key] === true} className="size-4 accent-[#4B0082]" />
                <span className="font-medium text-deep">{def.label}</span>
              </label>
            ) : (
              <label key={key} className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-deep">{def.label}</span>
                <input
                  name={key}
                  defaultValue={String(values[key] ?? "")}
                  {...(def.kind === "rupees" ? { type: "number", min: 0, step: "1", inputMode: "numeric" as const } : { maxLength: 120 })}
                  className={cls}
                />
                <FieldError state={state} name={key} />
              </label>
            ),
          )}
        </fieldset>
      )}
    </ActionForm>
  );
}
