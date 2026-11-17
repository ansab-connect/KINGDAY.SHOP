import { CheckCircle2, ClipboardCheck, MessageSquareText, PackageCheck, Search, Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";

/**
 * Animated "How BEST FIT works" (pure CSS, ~10 s loop): the five steps light up in turn,
 * the progress line fills, and the phone shows the timeline building, the way customers
 * see it in My Services. Motion stops for visitors who prefer reduced motion.
 */
const STEPS = [
  { icon: Wrench, en: "Choose a service", ml: "സർവീസ് തിരഞ്ഞെടുക്കൂ", den: "Service, fitting or repair", dml: "സർവീസ്, ഫിറ്റിംഗ്, റിപ്പയർ" },
  { icon: MessageSquareText, en: "Tell us the problem", ml: "പ്രശ്നം പറയൂ", den: "Photos or a voice note", dml: "ഫോട്ടോ അല്ലെങ്കിൽ വോയ്സ്" },
  { icon: Search, en: "We inspect first", ml: "ആദ്യം പരിശോധന", den: "Then share the cost", dml: "പിന്നെ ചെലവ് അറിയിക്കും" },
  { icon: ClipboardCheck, en: "Track every step", ml: "ഓരോ ഘട്ടവും അറിയൂ", den: "Live updates on your phone", dml: "ഫോണിൽ അപ്ഡേറ്റുകൾ" },
  { icon: PackageCheck, en: "Ready for delivery", ml: "ഡെലിവറിക്ക് തയ്യാർ", den: "Clear bill, easy payment", dml: "വ്യക്തമായ ബിൽ" },
] as const;

const TIMELINE = ["Booking received", "Inspection started", "Inspection completed", "Service in progress", "Ready for delivery"];

export function BestFitHowItWorks() {
  return (
    <section aria-labelledby="bf-how" className="bf-motion overflow-hidden rounded-3xl bg-deep p-5 text-white sm:p-8">
      <div className="grid items-center gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">BEST FIT</p>
          <h2 id="bf-how" className="mt-1 text-2xl font-bold sm:text-3xl">
            <L en="How your service works" ml="സർവീസ് എങ്ങനെ" />
          </h2>

          <div className="relative mt-6">
            {/* Progress line (desktop: across the top; phone: down the left). */}
            <div aria-hidden className="absolute top-6 right-[10%] left-[10%] hidden h-1 rounded-full bg-white/15 sm:block">
              <div className="bf-fill-x h-full rounded-full bg-gold" />
            </div>
            <div aria-hidden className="absolute top-6 bottom-6 left-6 w-1 rounded-full bg-white/15 sm:hidden">
              <div className="bf-fill-y w-full rounded-full bg-gold" />
            </div>
            <ol className="relative grid gap-4 sm:grid-cols-5 sm:gap-2">
              {STEPS.map((s, i) => (
                <li key={s.en} className="flex items-center gap-4 sm:flex-col sm:text-center" style={{ ["--i" as string]: i }}>
                  <span className="bf-step relative z-10 grid size-12 shrink-0 place-items-center rounded-full border-2 border-white/20 bg-deep text-white/60">
                    <s.icon aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="bf-label block text-sm font-semibold text-white/70">
                      <L en={s.en} ml={s.ml} />
                    </span>
                    <span className="block text-xs text-white/50">
                      <L en={s.den} ml={s.dml} />
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Phone showing the timeline building itself. */}
        <div aria-hidden className="mx-auto w-56 rounded-[2rem] border-4 border-white/15 bg-white p-3 text-deep shadow-2xl sm:w-64">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-muted" />
          <p className="font-mono text-xs font-bold text-royal">KD-SB-000123</p>
          <p className="text-sm font-semibold">Kids electric jeep</p>
          <div className="mt-2 grid grid-cols-5 gap-1">
            {TIMELINE.map((_, i) => (
              <span key={i} className="bf-bar h-1.5 rounded-full bg-muted" style={{ ["--i" as string]: i }} />
            ))}
          </div>
          <ol className="mt-3 flex flex-col gap-2 border-l-2 border-royal-200 pl-3">
            {TIMELINE.map((t, i) => (
              <li key={t} className="bf-line relative text-xs" style={{ ["--i" as string]: i }}>
                <span className="absolute top-1 -left-[1.05rem] size-2 rounded-full bg-royal" />
                <span className="flex items-center gap-1 font-semibold">
                  {i === TIMELINE.length - 1 ? <CheckCircle2 className="size-3.5 text-success" /> : null}
                  {t}
                </span>
                <span className="text-[0.65rem] text-muted-foreground">Today, {10 + i}:{i % 2 ? "30" : "05"} am</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
