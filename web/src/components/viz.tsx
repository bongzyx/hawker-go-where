import { useEffect, useRef } from "react";
import type { Closure } from "../../shared/types";
import { dayNumber, dayOfYear, daysInYear, weekday } from "../lib/dates";
import { STATE_LABEL, type State } from "../lib/status";
import { ScrollRow } from "./ScrollRow";

export const STATE_VAR: Record<State, string> = {
  closed: "var(--status-closed)",
  works: "var(--status-works)",
  soon: "var(--status-soon)",
  open: "var(--status-open)",
};

/** Colour + shape, so status never relies on colour alone. */
export function StatusDot({ state, size = 10 }: { state: State; size?: number }) {
  const closed = state === "closed" || state === "works";
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: STATE_VAR[state],
        boxShadow: closed ? `0 0 0 2px var(--surface), 0 0 0 3.5px var(--text-primary)` : undefined,
      }}
    />
  );
}

export function StatusPill({ state }: { state: State }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background: `color-mix(in srgb, ${STATE_VAR[state]} 16%, transparent)`,
        color: "var(--text-primary)",
      }}
    >
      <StatusDot state={state} size={7} />
      {STATE_LABEL[state]}
    </span>
  );
}

export type DayCount = { day: string; cleaning: number; works: number };

/**
 * The next few weeks as a strip of days, each with a bar for how many hawkers
 * are closed. It is both a chart (where are the busy cleaning weeks?) and the
 * date picker that recolours the map and list.
 */
export function DayStrip({
  counts,
  value,
  today,
  onChange,
}: {
  counts: DayCount[];
  value: string;
  today: string;
  onChange: (day: string) => void;
}) {
  const max = Math.max(4, ...counts.map((c) => c.cleaning + c.works));
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-day="${value}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [value]);

  return (
    <ScrollRow ref={scroller} className="flex gap-1 pb-1" role="listbox" aria-label="Pick a day">
      {counts.map((c) => {
        const active = c.day === value;
        const isToday = c.day === today;
        const weekend = ["Sat", "Sun"].includes(weekday(c.day));
        const total = c.cleaning + c.works;
        const h = 28;
        const worksH = (c.works / max) * h;
        const cleanH = (c.cleaning / max) * h;
        return (
          <button
            key={c.day}
            data-day={c.day}
            role="option"
            aria-selected={active}
            aria-label={`${weekday(c.day)} ${dayNumber(c.day)}: ${c.cleaning} closed for cleaning, ${c.works} for works`}
            onClick={() => onChange(c.day)}
            className="pressable flex w-12 shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 outline-none"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--accent-text)" : "var(--text-primary)",
            }}
          >
            <span className="text-[11px] font-medium" style={{ opacity: active ? 0.85 : weekend ? 0.9 : 0.6 }}>
              {isToday ? "Today" : weekday(c.day, "short").slice(0, 3)}
            </span>
            <span className="tabular text-sm font-semibold leading-none">{dayNumber(c.day)}</span>
            <svg width="16" height={h} aria-hidden className="mt-0.5 overflow-visible">
              <rect x="0" y="0" width="16" height={h} rx="3" fill="currentColor" opacity={0.07} />
              {c.works > 0 && (
                <rect x="0" y={h - worksH} width="16" height={worksH} rx="2" fill="var(--status-works)" />
              )}
              {c.cleaning > 0 && (
                <rect x="0" y={h - worksH - cleanH} width="16" height={cleanH} rx="2" fill="var(--status-closed)" />
              )}
            </svg>
            <span className="tabular text-[11px] font-semibold leading-none" style={{ opacity: total ? 1 : 0.4 }}>
              {total}
            </span>
          </button>
        );
      })}
    </ScrollRow>
  );
}

/**
 * The hawker's whole year on one line: each closure as a block on a Jan–Dec
 * track, with today and the viewing day marked. Past closures are faded.
 */
export function YearTimeline({ closures, today, day }: { closures: Closure[]; today: string; day: string }) {
  const year = Number(day.slice(0, 4));
  const total = daysInYear(year);
  const W = 336;
  const x = (iso: string) => (dayOfYear(iso) / total) * W;
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;

  const blocks = closures
    .filter((c) => c.start && c.end && c.end >= yStart && c.start <= yEnd)
    .map((c) => {
      const s = c.start! < yStart ? yStart : c.start!;
      const e = c.end! > yEnd ? yEnd : c.end!;
      const x0 = x(s);
      const x1 = x(e) + W / total;
      return { c, x0, w: Math.max(3, x1 - x0), past: c.end! < today };
    });

  return (
    <svg viewBox={`0 0 ${W} 46`} className="w-full" role="img" aria-label={`Closures in ${year}`}>
      {months.map((m, i) => (
        <g key={m}>
          <rect x={x(m)} y={8} width={W / 12 - 1} height={18} rx={3} fill="var(--text-primary)" opacity={i % 2 ? 0.05 : 0.08} />
          <text x={x(m) + W / 24} y={40} textAnchor="middle" fontSize="9" fill="var(--text-secondary)">
            {"JFMAMJJASOND"[i]}
          </text>
        </g>
      ))}
      {blocks.map(({ c, x0, w, past }, i) => (
        <rect
          key={i}
          x={x0}
          y={8}
          width={w}
          height={18}
          rx={2}
          fill={c.kind === "works" ? "var(--status-works)" : "var(--status-closed)"}
          opacity={past ? 0.35 : 1}
        />
      ))}
      {today.startsWith(String(year)) && (
        <g>
          <line x1={x(today)} x2={x(today)} y1={3} y2={31} stroke="var(--text-primary)" strokeWidth={1.5} />
          <circle cx={x(today)} cy={3} r={2.5} fill="var(--text-primary)" />
        </g>
      )}
      {day !== today && (
        <line x1={x(day)} x2={x(day)} y1={4} y2={30} stroke="var(--link)" strokeWidth={1.5} strokeDasharray="2 2" />
      )}
    </svg>
  );
}
