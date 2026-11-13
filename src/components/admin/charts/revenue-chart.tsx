"use client";

import { useState } from "react";
import { formatNumber, formatPaise, formatPaiseCompact } from "@/lib/format";

type Point = { date: string; label: string; revenue: number; orders: number };

const W = 720;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 52 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/**
 * Single-series daily revenue bar chart (hand-built SVG, no chart dependency).
 * Hover/focus shows a tooltip; a visually hidden table provides the same data.
 */
export function RevenueChart({ data }: { data: Point[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.revenue)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / data.length;
  const barW = Math.max(4, slot - 4); // 2px gap each side
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const activePoint = active !== null ? data[active] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Daily revenue for the last 30 days"
        onMouseLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray={t === 0 ? undefined : "2 4"} />
            <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular">
              {formatPaiseCompact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const h = Math.max(0, PAD.top + innerH - y(d.revenue));
          const r = Math.min(4, barW / 2, h);
          const top = y(d.revenue);
          const base = PAD.top + innerH;
          // Rounded top corners only; square at the baseline.
          const path = h > 0
            ? `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`
            : "";
          const isActive = active === i;
          return (
            <g key={d.date}>
              {path ? (
                <path
                  d={path}
                  className={isActive ? "fill-royal" : active === null ? "fill-royal-500" : "fill-royal-200"}
                  style={{ transition: "fill 150ms" }}
                />
              ) : null}
              {/* Oversized hit target */}
              <rect
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.label}: ${formatPaise(d.revenue)}, ${d.orders} orders`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none"
              />
              {i % 5 === 0 || i === data.length - 1 ? (
                <text x={PAD.left + i * slot + slot / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {activePoint && active !== null ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lift"
          style={{ left: `${((PAD.left + active * slot + slot / 2) / W) * 100}%` }}
        >
          <p className="font-medium text-muted-foreground">{activePoint.label}</p>
          <p className="mt-0.5 font-heading text-sm font-semibold text-deep tabular">{formatPaise(activePoint.revenue)}</p>
          <p className="text-muted-foreground tabular">{formatNumber(activePoint.orders)} orders</p>
        </div>
      ) : null}

      <table className="sr-only">
        <caption>Daily revenue, last 30 days</caption>
        <thead>
          <tr><th>Date</th><th>Revenue</th><th>Orders</th></tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}><td>{d.label}</td><td>{formatPaise(d.revenue)}</td><td>{d.orders}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
