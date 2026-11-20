"use client";

import { useEffect, useId, useState } from "react";
import { CharacterPopup } from "@/components/store/hero/character-popup";
import { HeroActions } from "@/components/store/hero/hero-actions";
import { SpeechPopup } from "@/components/store/hero/speech-popup";
import { Walkers } from "@/components/store/hero/walkers";
import { Kid } from "@/components/store/hero/kid";
import {
  characterSize,
  charactersFromMetadata,
  KING,
  MIA,
  type CustomerCharacter,
  type Effect,
  type HeroTheme,
  type SceneKey,
} from "@/features/marketing/hero-theme-config";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
  theme: HeroTheme & { sceneUrls: (string | null)[] };
  /** Preview: show these instead of the signed-in customer's characters. */
  characters?: CustomerCharacter[];
  className?: string;
  /** Overlay (e.g. the headline) drawn above the scene. */
  children?: React.ReactNode;
};

const SCENE_MS = 3500;
/** Official mascots from the KING DAY reference sheet (saved once in /public, never regenerated). */
const OFFICIAL: Record<string, { src: string; height: string }> = {
  [KING.id]: { src: "/characters/king.webp", height: "h-[86%]" },
  [MIA.id]: { src: "/characters/mia.webp", height: "h-[70%]" },
};

/**
 * Animated hero scene: the theme's 3–4 backgrounds cross-fade every few seconds behind
 * King, Mia and the customer's own characters. Pure CSS/SVG; uploaded banners load as images,
 * and fall back to the drawn scene if they fail.
 */
export function HeroStage({ theme, characters, className, children }: Props) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [mine, setMine] = useState<CustomerCharacter[] | null>(characters ?? null);
  const count = theme.scenes.length;

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % count), SCENE_MS);
    return () => window.clearInterval(t);
  }, [count]);

  useEffect(() => {
    if (characters) return;
    // Characters live in the account's metadata: read from the local session, no extra request.
    let alive = true;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (alive) setMine(data.session ? charactersFromMetadata(data.session.user.user_metadata) : []);
      })
      .catch(() => alive && setMine([]));
    return () => {
      alive = false;
    };
  }, [characters]);

  const cast = [KING, MIA, ...(mine ?? [])];

  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      {theme.scenes.map((scene, i) => {
        const url = theme.sceneUrls[i];
        return (
          <div key={i} aria-hidden className={cn("absolute inset-0 transition-opacity duration-1000", i === index ? "opacity-100" : "opacity-0")}>
            {url && !failed[i] ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin banner, already resized on upload
              <img src={url} alt="" loading={i === 0 ? "eager" : "lazy"} decoding="async" onError={() => setFailed((f) => ({ ...f, [i]: true }))} className="size-full object-cover" />
            ) : (
              <SceneArt preset={scene.preset} sky={theme.sky} accent={theme.accent} />
            )}
          </div>
        );
      })}
      <Effects effect={theme.effect} accent={theme.accent} />

      {children}
      <div className="absolute inset-x-0 bottom-0 flex h-[60%] items-end justify-center gap-1 px-3 pb-3 sm:gap-3">
        {cast.map((c, i) =>
          OFFICIAL[c.id] ? (
            <figure key={c.id} className={cn("kd-bob relative flex flex-col items-center", OFFICIAL[c.id].height, cast.length > 3 ? "max-w-[24%]" : "max-w-[34%]")} style={{ animationDelay: `${i * 0.6}s` }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- small static cut-out */}
              <img src={OFFICIAL[c.id].src} alt={c.name} className={cn("h-full w-auto object-contain drop-shadow-[0_10px_12px_rgb(0_0_0/0.3)]", i === 0 && "kd-hop")} fetchPriority={i === 0 ? "high" : "auto"} />
              <figcaption className="-mt-1 rounded-full bg-white/90 px-2 py-0.5 text-[0.65rem] font-bold text-deep shadow-sm sm:text-xs">{c.name}</figcaption>
            </figure>
          ) : (
          <Kid
            key={c.id}
            look={c.look}
            costume={theme.costume}
            size={characterSize(c)}
            wave={i === 0 || i === 2}
            delay={i * 0.6}
            label={c.name}
            className={cast.length > 3 ? "max-w-[22%]" : "max-w-[30%]"}
          />
          ),
        )}
      </div>

      {!characters ? (
        <>
          <HeroActions mine={mine ?? []} />
          <SpeechPopup mine={mine ?? []} />
          <Walkers mine={mine ?? []} costume={theme.costume} />
        </>
      ) : null}

      {mine && mine.length === 0 && !characters ? <CharacterPopup /> : null}
    </div>
  );
}

/** Drawn background scenes, coloured by the theme. */
export function SceneArt({ preset, sky, accent }: { preset: SceneKey; sky: [string, string]; accent: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full">
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#sky${id})`} />
      {preset === "castle" ? (
        <g>
          <circle cx="320" cy="60" r="26" fill={accent} opacity="0.85" />
          <path d="M0 230 q100 -50 200 -10 t200 -20 v100 h-400 z" fill="#000" opacity="0.25" />
          <g fill="#000" opacity="0.35">
            <rect x="140" y="130" width="120" height="110" />
            <rect x="120" y="100" width="34" height="140" />
            <rect x="246" y="100" width="34" height="140" />
            <path d="M120 100 l17 -30 17 30 z M246 100 l17 -30 17 30 z" />
            <rect x="186" y="96" width="28" height="40" />
          </g>
          <path d="M137 70 v-16 l14 6 -14 6 M263 70 v-16 l14 6 -14 6" stroke={accent} strokeWidth="2" fill={accent} />
        </g>
      ) : preset === "park" ? (
        <g>
          <circle cx="70" cy="70" r="30" fill={accent} opacity="0.9" />
          <path d="M0 210 q120 -60 240 -10 t160 -10 v110 h-400 z" fill="#58b368" />
          <path d="M0 240 q140 -40 260 0 t140 0 v60 h-400 z" fill="#3e9651" />
          {[310, 350].map((x) => (
            <g key={x}>
              <rect x={x - 4} y="170" width="8" height="40" fill="#7a4a2c" />
              <circle cx={x} cy="160" r="22" fill="#2e7d32" />
            </g>
          ))}
        </g>
      ) : preset === "road" ? (
        <g>
          <circle cx="200" cy="170" r="50" fill={accent} opacity="0.7" />
          <path d="M0 180 q100 -30 200 0 t200 0 v120 h-400 z" fill="#000" opacity="0.25" />
          <path d="M170 180 h60 l90 120 h-240 z" fill="#3b3b4f" />
          <path d="M200 190 v14 M200 220 v18 M200 254 v24" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </g>
      ) : preset === "beach" ? (
        <g>
          <circle cx="300" cy="80" r="34" fill={accent} opacity="0.9" />
          <rect y="180" width="400" height="50" fill="#3aa0d8" />
          <path d="M0 190 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" fill="none" />
          <path d="M0 225 q200 -20 400 0 v75 h-400 z" fill="#f4d58d" />
          <path d="M60 230 q-4 -50 10 -80" stroke="#7a4a2c" strokeWidth="6" fill="none" />
          <path d="M70 150 q-30 -6 -44 8 M70 150 q24 -16 44 -2 M70 150 q-6 -24 -26 -30" stroke="#2e7d32" strokeWidth="8" fill="none" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <path d="M300 40 a28 28 0 1 0 22 46 a22 22 0 1 1 -22 -46 z" fill={accent} />
          <path d="M0 220 q60 -40 120 -10 q60 -50 140 -10 q70 -30 140 0 v100 h-400 z" fill="#000" opacity="0.35" />
        </g>
      )}
    </svg>
  );
}

const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  top: (i * 53 + 7) % 70,
  delay: ((i * 7) % 10) / 2,
  duration: 6 + (i % 4) * 1.5,
  size: 4 + (i % 3) * 2,
}));
const CONFETTI = ["#ff006e", "#ffd700", "#3a86ff", "#8338ec", "#06d6a0"];

/** Light CSS particle effects (no canvas, no library). */
export function Effects({ effect, accent }: { effect: Effect; accent: string }) {
  if (effect === "sun") {
    return <div aria-hidden className="kd-spin pointer-events-none absolute -top-24 -left-24 size-64 rounded-full opacity-40" style={{ background: `repeating-conic-gradient(${accent} 0 6deg, transparent 6deg 18deg)` }} />;
  }
  if (effect === "lights") {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-2 flex justify-around">
        {PARTICLES.slice(0, 12).map((p, i) => (
          <span key={i} className="kd-twinkle size-2.5 rounded-full" style={{ background: CONFETTI[i % CONFETTI.length], animationDelay: `${p.delay}s`, boxShadow: `0 0 10px ${CONFETTI[i % CONFETTI.length]}` }} />
        ))}
      </div>
    );
  }
  const falling = effect === "snow" || effect === "confetti" || effect === "petals";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={cn("absolute", falling ? "kd-fall -top-4" : "kd-twinkle", effect === "petals" ? "rounded-[60%_0]" : effect === "confetti" ? "rounded-[1px]" : "rounded-full")}
          style={{
            left: `${p.left}%`,
            top: falling ? undefined : `${p.top}%`,
            width: effect === "confetti" ? p.size * 0.7 : p.size,
            height: effect === "confetti" ? p.size * 1.4 : p.size,
            background: effect === "snow" ? "#fff" : effect === "confetti" ? CONFETTI[i % CONFETTI.length] : effect === "petals" ? (i % 2 ? "#ffb627" : "#e85d04") : effect === "stars" ? "#fff" : accent,
            animationDelay: `${p.delay}s`,
            animationDuration: `${falling ? p.duration : 2 + (i % 3)}s`,
            boxShadow: effect === "sparkles" ? `0 0 8px ${accent}` : undefined,
          }}
        />
      ))}
    </div>
  );
}
