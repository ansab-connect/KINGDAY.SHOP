/** Decorative hero illustration: a royal wheel with a crown hub. Purely ornamental. */
export function HeroArt({ className }: { className?: string }) {
  const spokes = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
  return (
    <svg viewBox="0 0 480 480" className={className} aria-hidden fill="none">
      <defs>
        <radialGradient id="hero-glow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#6d26a8" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#1a0f2e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#eedc95" />
          <stop offset="55%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#987820" />
        </linearGradient>
      </defs>
      <circle cx="240" cy="240" r="236" fill="url(#hero-glow)" />
      <g className="origin-center motion-safe:animate-[spin_60s_linear_infinite]" style={{ transformBox: "fill-box" }}>
        <circle cx="240" cy="240" r="190" stroke="url(#hero-gold)" strokeWidth="2" />
        <circle cx="240" cy="240" r="172" stroke="#d4af37" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 10" />
        {spokes.map((deg) => (
          <line
            key={deg}
            x1="240"
            y1="240"
            x2="240"
            y2="68"
            stroke="#d4af37"
            strokeOpacity="0.28"
            strokeWidth="1.5"
            transform={`rotate(${deg} 240 240)`}
          />
        ))}
      </g>
      <circle cx="240" cy="240" r="96" fill="#1a0f2e" stroke="url(#hero-gold)" strokeWidth="2" />
      <circle cx="240" cy="240" r="84" stroke="#ffffff" strokeOpacity="0.08" />
      {/* Crown */}
      <path
        d="M196 262 L188 214 L214 236 L240 200 L266 236 L292 214 L284 262 Z"
        fill="url(#hero-gold)"
      />
      <rect x="196" y="268" width="88" height="10" rx="3" fill="url(#hero-gold)" />
      <circle cx="188" cy="210" r="5" fill="#eedc95" />
      <circle cx="240" cy="195" r="6" fill="#eedc95" />
      <circle cx="292" cy="210" r="5" fill="#eedc95" />
      {/* Orbiting accents */}
      <circle cx="430" cy="240" r="5" fill="#d4af37" />
      <circle cx="68" cy="150" r="3" fill="#d4af37" fillOpacity="0.7" />
      <circle cx="120" cy="420" r="4" fill="#b791da" fillOpacity="0.6" />
    </svg>
  );
}
