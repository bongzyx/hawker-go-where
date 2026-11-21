import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Closure } from "../../shared/types";
import {
  addDays,
  addMonths,
  dayNumber,
  dayOfYear,
  daysInMonth,
  daysInYear,
  formatDay,
  formatMonth,
  startOfMonth,
  weekday,
  weekdayIndex,
} from "../lib/dates";
import { STATE_LABEL, type State } from "../lib/status";
import { haptics } from "../lib/telegram";
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
  onReselect,
}: {
  counts: DayCount[];
  value: string;
  today: string;
  onChange: (day: string) => void;
  /** Called when the already-picked day is tapped again. */
  onReselect?: () => void;
}) {
  const max = Math.max(4, ...counts.map((c) => c.cleaning + c.works));
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-day="${value}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [value]);

  return (
    <ScrollRow ref={scroller} className="flex gap-1 pb-1" role="listbox" aria-label="Pick a day">
      {counts.map((c, i) => {
        const active = c.day === value;
        const isToday = c.day === today;
        const weekend = ["Sat", "Sun"].includes(weekday(c.day));
        const total = c.cleaning + c.works;
        const h = 28;
        const worksH = (c.works / max) * h;
        const cleanH = (c.cleaning / max) * h;
        // A hairline before each Monday marks where a new week starts.
        const newWeek = i > 0 && weekday(c.day) === "Mon";
        return (
          <Fragment key={c.day}>
            {newWeek && <span aria-hidden className="mx-0.5 my-3 w-px shrink-0 self-stretch bg-line" />}
            <button
              data-day={c.day}
              role="option"
              aria-selected={active}
              aria-label={`${weekday(c.day)} ${dayNumber(c.day)}: ${c.cleaning} closed for cleaning, ${c.works} for works`}
              onClick={() => (active ? onReselect?.() : onChange(c.day))}
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
          </Fragment>
        );
      })}
    </ScrollRow>
  );
}

/** How far ahead the month view goes. */
const MONTHS_AHEAD = 12;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

type Swipe = { id: number; x: number; y: number; t: number; dx: number; mode: "pending" | "drag" | "scroll" };

/**
 * The day picker as a month calendar (Monday first). Each day carries a small
 * bar for how many hawkers are closed, like the strip. Tapping the picked day
 * again calls `onReselect`, also like the strip. Days before today are greyed out.
 *
 * Page between months with the arrows, a sideways swipe (the grid follows the
 * finger), or the mouse wheel / trackpad. The new month slides in from that side.
 * The grid is always six weeks tall so the card never jumps between months.
 */
export function MonthCalendar({
  value,
  today,
  countOn,
  onChange,
  onReselect,
}: {
  value: string;
  today: string;
  countOn: (day: string) => DayCount;
  onChange: (day: string) => void;
  onReselect?: () => void;
}) {
  // `dir` is which way the last page went, for the slide-in (0: no animation).
  const [view, setView] = useState(() => ({ month: startOfMonth(value), dir: 0 }));
  const month = view.month;
  // Follow the picked day when it is changed from elsewhere (the strip, midnight).
  useEffect(() => {
    const m = startOfMonth(value);
    setView((v) => (v.month === m ? v : { month: m, dir: m > v.month ? 1 : -1 }));
  }, [value]);

  const first = startOfMonth(today);
  const last = addMonths(today, MONTHS_AHEAD);
  const canPage = (n: number) => (n < 0 ? month > first : month < last);

  const days = useMemo(
    () => Array.from({ length: daysInMonth(month) }, (_, i) => countOn(addDays(month, i))),
    [month, countOn],
  );
  const max = Math.max(4, ...days.map((c) => c.cleaning + c.works));
  const lead = weekdayIndex(month);
  const trail = 42 - lead - days.length;

  const shown = useRef(month);
  shown.current = month;
  const page = useCallback(
    (n: 1 | -1) => {
      const next = addMonths(shown.current, n);
      if (next < first || next > last) return;
      haptics.select();
      shown.current = next;
      setView({ month: next, dir: n });
    },
    [first, last],
  );

  const grid = useRef<HTMLDivElement>(null);
  const swipe = useRef<Swipe | null>(null);
  // A swipe that ends on a day must not also pick it: swallow the click that follows.
  const swallowUntil = useRef(0);

  const place = (x: number, ms = 0) => {
    const n = grid.current;
    if (!n) return;
    n.style.transition = ms ? `transform ${ms}ms ${EASE}, opacity ${ms}ms ${EASE}` : "none";
    n.style.transform = x ? `translateX(${x}px)` : "";
    n.style.opacity = x ? String(Math.max(0.4, 1 - Math.abs(x) / 400)) : "";
  };

  // Touch and pen: follow the finger sideways, then page or spring back.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || !e.isPrimary) return;
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, mode: "pending" };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId || s.mode === "scroll") return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.mode === "pending") {
      if (Math.abs(dx) + Math.abs(dy) < 6) return;
      s.mode = Math.abs(dx) > Math.abs(dy) ? "drag" : "scroll";
      if (s.mode === "scroll") return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone; the drag still works without capture.
      }
    }
    // Resist past the first and last month.
    s.dx = canPage(dx < 0 ? 1 : -1) ? dx : dx * 0.25;
    place(s.dx);
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    swipe.current = null;
    if (s.mode !== "drag") return;
    swallowUntil.current = performance.now() + 400;
    const n: 1 | -1 = s.dx < 0 ? 1 : -1;
    const fast = Math.abs(s.dx) / Math.max(1, e.timeStamp - s.t) > 0.4;
    if (e.type === "pointerup" && (Math.abs(s.dx) > 60 || (fast && Math.abs(s.dx) > 20)) && canPage(n)) {
      place(0);
      page(n);
    } else {
      place(0, 250);
    }
  };

  // Mouse wheel or trackpad: one month per flick. A burst of wheel events (a
  // spin, or a trackpad's momentum) counts as one gesture until it goes quiet.
  const wheel = useRef({ acc: 0, last: 0, fired: false });
  useEffect(() => {
    const n = grid.current?.parentElement;
    if (!n) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const w = wheel.current;
      if (e.timeStamp - w.last > 180) {
        w.acc = 0;
        w.fired = false;
      }
      w.last = e.timeStamp;
      if (w.fired) return;
      w.acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(w.acc) >= 40) {
        w.fired = true;
        page(w.acc > 0 ? 1 : -1);
      }
    };
    n.addEventListener("wheel", onWheel, { passive: false });
    return () => n.removeEventListener("wheel", onWheel);
  }, [page]);

  const arrow = (n: 1 | -1) => (
    <button
      type="button"
      onClick={() => page(n)}
      disabled={!canPage(n)}
      aria-label={n < 0 ? "Previous month" : "Next month"}
      className="pressable grid size-8 place-items-center rounded-full disabled:opacity-25"
    >
      {n < 0 ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
    </button>
  );
  const slide = view.dir > 0 ? "animate-month-next" : view.dir < 0 ? "animate-month-prev" : "";

  return (
    <div className="overflow-hidden">
      <div className="mb-1 flex items-center justify-between px-1">
        {arrow(-1)}
        <span key={month} className={`text-[13px] font-semibold ${view.dir ? "animate-fade-in" : ""}`} aria-live="polite">
          {formatMonth(month)}
        </span>
        {arrow(1)}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center" aria-hidden>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="pb-1 text-[11px] font-medium text-secondary">
            {d}
          </span>
        ))}
      </div>
      <div
        ref={grid}
        className="touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          if (performance.now() > swallowUntil.current) return;
          swallowUntil.current = 0;
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <div key={month} className={`grid grid-cols-7 gap-0.5 text-center ${slide}`} role="grid" aria-label={formatMonth(month)}>
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} aria-hidden />
          ))}
          {days.map((c) => {
            const active = c.day === value;
            const isToday = c.day === today;
            const past = c.day < today;
            const total = c.cleaning + c.works;
            const w = 18;
            const worksW = (c.works / max) * w;
            const cleanW = (c.cleaning / max) * w;
            return (
              <button
                key={c.day}
                type="button"
                disabled={past}
                aria-pressed={active}
                aria-label={`${formatDay(c.day)}: ${c.cleaning} closed for cleaning, ${c.works} for works`}
                onClick={() => (active ? onReselect?.() : onChange(c.day))}
                className="pressable flex h-11 flex-col items-center justify-center gap-1 rounded-xl outline-none disabled:opacity-30"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent-text)" : "var(--text-primary)",
                  boxShadow: isToday && !active ? "inset 0 0 0 1px var(--border)" : undefined,
                }}
              >
                <span className={`tabular text-sm leading-none ${isToday || active ? "font-bold" : "font-medium"}`}>
                  {dayNumber(c.day)}
                </span>
                <svg width={w} height="3" aria-hidden className="overflow-visible" style={{ opacity: total ? 1 : 0.6 }}>
                  <rect x="0" y="0" width={w} height="3" rx="1.5" fill="currentColor" opacity={0.1} />
                  {c.works > 0 && <rect x="0" y="0" width={worksW} height="3" rx="1.5" fill="var(--status-works)" />}
                  {c.cleaning > 0 && (
                    <rect x={worksW} y="0" width={cleanW} height="3" rx="1.5" fill="var(--status-closed)" />
                  )}
                </svg>
              </button>
            );
          })}
          {Array.from({ length: trail }, (_, i) => (
            <span key={`trail-${i}`} aria-hidden className="h-11" />
          ))}
        </div>
      </div>
    </div>
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
