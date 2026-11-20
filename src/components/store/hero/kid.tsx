import type { CharacterLook, Costume } from "@/features/marketing/hero-theme-config";
import { cn } from "@/lib/utils";

const GOLD = "#d4af37";
const SIZE = { adult: "h-[92%]", kid: "h-[74%]", toddler: "h-[56%]" } as const;

/**
 * A cute cartoon character drawn in SVG from a fixed look, so King, Mia and every customer
 * character always look the same (no image generation, nothing to download).
 * Blinks, bobs and waves with CSS (globals.css: kd-blink, kd-bob, kd-wave); still for reduced motion.
 */
export function Kid({
  look,
  costume = "none",
  size = "kid",
  wave = false,
  delay = 0,
  label,
  className,
}: {
  look: CharacterLook;
  costume?: Costume;
  size?: keyof typeof SIZE;
  wave?: boolean;
  /** Animation offset in seconds so characters don't move in sync. */
  delay?: number;
  label?: string;
  className?: string;
}) {
  const hatCostume = costume === "santa" || costume === "beanie" || costume === "party";
  const showAccessory = !(hatCostume && (look.accessory === "crown-cap" || look.accessory === "crown"));
  const anim = { animationDelay: `${delay}s` };
  return (
    <figure className={cn("kd-bob relative flex flex-col items-center", SIZE[size], className)} style={anim}>
      <svg viewBox="0 0 120 200" className="h-full w-auto drop-shadow-[0_8px_10px_rgb(0_0_0/0.25)]" role="img" aria-label={label ?? "Character"}>
        {/* Legs */}
        <rect x="44" y="160" width="13" height="30" rx="6" fill="#3b2a5a" />
        <rect x="63" y="160" width="13" height="30" rx="6" fill="#3b2a5a" />
        <ellipse cx="50" cy="192" rx="10" ry="5" fill="#fff" />
        <ellipse cx="70" cy="192" rx="10" ry="5" fill="#fff" />

        {/* Left arm (still) */}
        <rect x="22" y="104" width="14" height="44" rx="7" fill={look.outfit === "dress" ? look.skin : look.outfit_colour} transform="rotate(12 29 106)" />
        <circle cx="25" cy="148" r="7" fill={look.skin} />

        {/* Body */}
        {look.outfit === "dress" ? (
          <>
            <path d="M42 98 h36 l18 66 h-72 z" fill="#fff4e0" />
            <path d="M42 98 h36 l4 20 h-44 z" fill={look.outfit_colour} />
            <path d="M28 164 h64" stroke={look.outfit_colour} strokeWidth="5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <rect x="34" y="96" width="52" height="70" rx="18" fill={look.outfit_colour} />
            {look.outfit === "hoodie" ? (
              <>
                <path d="M44 100 q16 14 32 0" stroke="rgb(0 0 0 / 0.18)" strokeWidth="5" fill="none" strokeLinecap="round" />
                <path d="M52 108 v12 M68 108 v12" stroke="#fff" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" />
                {/* Gold crown logo */}
                <path d="M50 140 l-3 -12 8 6 5 -9 5 9 8 -6 -3 12 z" fill={GOLD} />
              </>
            ) : (
              <path d="M50 98 l10 12 10 -12" stroke="#fff" strokeWidth="4" fill="none" strokeLinejoin="round" />
            )}
          </>
        )}

        {/* Right arm (waves) */}
        <g className={wave ? "kd-wave" : undefined} style={{ transformOrigin: "88px 106px", ...anim }}>
          <rect x="84" y="62" width="14" height="46" rx="7" fill={look.outfit === "dress" ? look.skin : look.outfit_colour} transform="rotate(-18 91 106)" />
          <circle cx="102" cy="64" r="8" fill={look.skin} />
        </g>

        {/* Head */}
        {look.hair === "long" ? <path d="M24 64 q36 -64 72 0 v40 q-36 12 -72 0 z" fill={look.hair_colour} /> : null}
        <circle cx="27" cy="66" r="7" fill={look.skin} />
        <circle cx="93" cy="66" r="7" fill={look.skin} />
        <circle cx="60" cy="62" r="34" fill={look.skin} />
        <Hair look={look} />

        {/* Face */}
        <g className="kd-blink" style={{ transformOrigin: "60px 66px", ...anim }}>
          <ellipse cx="47" cy="66" rx="5" ry="6.5" fill="#24152f" />
          <ellipse cx="73" cy="66" rx="5" ry="6.5" fill="#24152f" />
          <circle cx="49" cy="63.5" r="1.8" fill="#fff" />
          <circle cx="75" cy="63.5" r="1.8" fill="#fff" />
        </g>
        <ellipse cx="40" cy="78" rx="6" ry="3.5" fill="#ff8fa3" opacity="0.55" />
        <ellipse cx="80" cy="78" rx="6" ry="3.5" fill="#ff8fa3" opacity="0.55" />
        <path d="M51 80 q9 9 18 0" stroke="#7a2e3a" strokeWidth="3" fill="none" strokeLinecap="round" />

        {showAccessory ? <Accessory kind={look.accessory} /> : null}
        <CostumePiece costume={costume} />
      </svg>
      {label ? (
        <figcaption className="-mt-1 rounded-full bg-white/90 px-2 py-0.5 text-[0.65rem] font-bold text-deep shadow-sm sm:text-xs">{label}</figcaption>
      ) : null}
    </figure>
  );
}

function Hair({ look }: { look: CharacterLook }) {
  const c = look.hair_colour;
  switch (look.hair) {
    case "curly":
      return (
        <g fill={c}>
          {[
            [32, 50, 11], [42, 38, 12], [56, 32, 13], [71, 34, 12], [83, 44, 11], [88, 56, 8], [30, 60, 7], [62, 40, 9],
          ].map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    case "short":
      return <path d="M26 58 q4 -34 34 -34 q30 0 34 34 q-14 -12 -34 -12 q-20 0 -34 12 z" fill={c} />;
    case "long":
      return <path d="M26 60 q2 -36 34 -36 q32 0 34 36 q-10 -18 -34 -18 q-24 0 -34 18 z" fill={c} />;
    case "bun":
      return (
        <g fill={c}>
          <circle cx="60" cy="22" r="12" />
          <path d="M26 58 q4 -34 34 -34 q30 0 34 34 q-14 -12 -34 -12 q-20 0 -34 12 z" />
        </g>
      );
    case "pigtails":
      return (
        <g fill={c}>
          <circle cx="22" cy="54" r="11" />
          <circle cx="98" cy="54" r="11" />
          <path d="M26 58 q4 -34 34 -34 q30 0 34 34 q-14 -12 -34 -12 q-20 0 -34 12 z" />
        </g>
      );
    default:
      return null;
  }
}

function Accessory({ kind }: { kind: CharacterLook["accessory"] }) {
  switch (kind) {
    case "crown-cap":
      return (
        <g>
          <path d="M26 46 q2 -30 34 -30 q32 0 34 30 z" fill="#ffd23f" />
          <path d="M60 44 q30 0 44 6 q-4 5 -16 4 q-14 -4 -28 -4 z" fill="#f4b400" />
          <path d="M50 38 l-3 -12 8 6 5 -9 5 9 8 -6 -3 12 z" fill="#4b0082" />
        </g>
      );
    case "bow":
      return (
        <g fill="#7b3fb5">
          <path d="M80 30 l-14 -9 v18 z" />
          <path d="M80 30 l14 -9 v18 z" />
          <circle cx="80" cy="30" r="4.5" fill="#5b2391" />
        </g>
      );
    case "glasses":
      return (
        <g stroke="#24152f" strokeWidth="2.5" fill="rgb(255 255 255 / 0.25)">
          <circle cx="47" cy="66" r="9" />
          <circle cx="73" cy="66" r="9" />
          <path d="M56 66 h8" />
        </g>
      );
    case "crown":
      return <path d="M40 30 l-4 -18 12 9 12 -14 12 14 12 -9 -4 18 z" fill={GOLD} stroke="#987820" strokeWidth="1.5" />;
    default:
      return null;
  }
}

function CostumePiece({ costume }: { costume: Costume }) {
  switch (costume) {
    case "santa":
      return (
        <g>
          <path d="M28 44 q30 -50 64 0 z" fill="#d62828" />
          <path d="M84 30 q14 -4 18 10" stroke="#d62828" strokeWidth="9" fill="none" strokeLinecap="round" />
          <circle cx="102" cy="42" r="6" fill="#fff" />
          <rect x="24" y="40" width="72" height="10" rx="5" fill="#fff" />
        </g>
      );
    case "beanie":
      return (
        <g>
          <path d="M26 48 q2 -34 34 -34 q32 0 34 34 z" fill="#3a86ff" />
          <rect x="24" y="42" width="72" height="10" rx="5" fill="#bde0fe" />
          <circle cx="60" cy="12" r="7" fill="#fff" />
        </g>
      );
    case "party":
      return (
        <g>
          <path d="M44 34 l16 -32 16 32 z" fill="#ff006e" />
          <path d="M50 22 l20 0 M47 28 l26 0" stroke="#ffd700" strokeWidth="3" />
          <circle cx="60" cy="3" r="4" fill="#ffd700" />
        </g>
      );
    case "sunglasses":
      return (
        <g fill="#111">
          <rect x="37" y="60" width="20" height="12" rx="5" />
          <rect x="63" y="60" width="20" height="12" rx="5" />
          <rect x="56" y="63" width="8" height="3" />
        </g>
      );
    case "flowers":
      return (
        <g>
          {[30, 42, 54, 66, 78, 90].map((x, i) => (
            <circle key={x} cx={x} cy={i === 0 || i === 5 ? 40 : 30 - (i === 2 || i === 3 ? 3 : 0)} r="5" fill={i % 2 ? "#ffb627" : "#fff"} stroke="#e85d04" strokeWidth="1" />
          ))}
        </g>
      );
    default:
      return null;
  }
}
