"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "./primitives";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Kolom vertikal satu seri dengan tooltip hover. */
export function ColumnChart({
  data,
  format,
  axisFormat,
  height = 220,
  highlightLast = true,
  ariaLabel,
}: {
  data: { label: string; value: number; sub?: string }[];
  format: (v: number) => string;
  axisFormat: (v: number) => string;
  height?: number;
  highlightLast?: boolean;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 56;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.min(44, slot * 0.56);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeDasharray={t === 0 ? undefined : "2 4"} />
            <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="rgb(var(--faint))" className="num">
              {axisFormat(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const h = Math.max(0, innerH - (y(d.value) - padT));
          const isLast = i === data.length - 1;
          const r = Math.min(4, barW / 2, h);
          const x0 = cx - barW / 2;
          const top = y(d.value);
          const base = padT + innerH;
          const path = h > 0 ? `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${base} Z` : "";
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" />
              {hover === i && <rect x={padL + slot * i + 2} y={padT} width={slot - 4} height={innerH} fill="rgb(var(--ink) / 0.04)" rx={6} />}
              {path && <path d={path} fill="var(--series-1)" opacity={highlightLast && !isLast && hover !== i ? 0.55 : 1} />}
              <text x={cx} y={height - 8} textAnchor="middle" fontSize="11" fill={isLast ? "rgb(var(--ink))" : "rgb(var(--faint))"} fontWeight={isLast ? 600 : 400}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop"
          style={{ left: Math.min(Math.max(padL + slot * hover + slot / 2, 70), width - 70), top: y(data[hover].value) - 6 }}
        >
          <div className="font-semibold text-muted">{data[hover].sub ?? data[hover].label}</div>
          <div className="num text-[13px] font-bold text-ink">{format(data[hover].value)}</div>
        </div>
      )}
    </div>
  );
}

/** Daftar batang horizontal (peringkat / komposisi). */
export function BarList({
  data,
  format,
  total,
  color = "var(--series-1)",
}: {
  data: { label: string; value: number; hint?: string }[];
  format: (v: number) => string;
  total?: number;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const sum = total ?? data.reduce((a, d) => a + d.value, 0);
  return (
    <ul className="flex flex-col gap-3">
      {data.map((d) => {
        const pct = sum ? Math.round((d.value / sum) * 100) : 0;
        return (
          <li key={d.label} className="group" title={`${d.label}: ${format(d.value)} (${pct}%)`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate font-medium">{d.label}</span>
              <span className="num shrink-0 text-muted">
                <span className="font-semibold text-ink">{format(d.value)}</span>
                <span className="ml-2 inline-block w-9 text-right text-faint">{pct}%</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-ink/[0.05]">
              <div className="h-2 rounded-full transition-[width] duration-500" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: color }} />
            </div>
            {d.hint && <div className="mt-0.5 text-[11px] text-faint">{d.hint}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** Meter okupansi melingkar kecil. */
export function Ring({ value, size = 64, stroke = 7, className }: { value: number; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} className={cn("-rotate-90", className)} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--ink) / 0.08)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--accent))" strokeWidth={stroke} strokeDasharray={`${(v / 100) * c} ${c}`} strokeLinecap="round" />
    </svg>
  );
}
