/**
 * English / Malayalam text.
 *
 * Both languages are rendered and CSS shows the one chosen (html[data-lang]).
 * This keeps static and cached pages static, avoids a flash of the wrong
 * language, and works in server and client components alike.
 * The choice is stored in localStorage + a cookie and applied before paint
 * by LANG_BOOT_SCRIPT in the root layout.
 */

export type Lang = "en" | "ml";
export const LANG_STORAGE_KEY = "kd-lang";

/** Bilingual text. Use for visible UI text. */
export function L({ en, ml }: { en: React.ReactNode; ml: React.ReactNode }) {
  return (
    <>
      <span className="i18n-en">{en}</span>
      <span className="i18n-ml" lang="ml">{ml}</span>
    </>
  );
}

/** Runs in <head> before first paint: applies the saved language. */
export const LANG_BOOT_SCRIPT = `try{var l=localStorage.getItem("${LANG_STORAGE_KEY}");if(l==="ml"){document.documentElement.dataset.lang="ml";document.documentElement.lang="ml-IN"}}catch(e){}`;
