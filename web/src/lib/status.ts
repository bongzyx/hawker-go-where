import type { Closure, Hawker } from "../../shared/types";
import { addDays, daysBetween, formatDay, formatRange, relativeDays } from "./dates";

/**
 * What a hawker is doing on a given day.
 *
 *   closed , inside a cleaning (or short works) window
 *   works  , inside a long works closure (repairs & redecoration, ≥ 2 weeks)
 *   soon   , open, but a closure starts within SOON_DAYS
 *   open   , no closure scheduled on or near the day
 *
 * "Open" means "not closed by NEA". Individual stall hours still vary.
 */
export type State = "closed" | "works" | "soon" | "open";

export const SOON_DAYS = 7;
const LONG_CLOSURE_DAYS = 14;

export const STATE_ORDER: State[] = ["closed", "works", "soon", "open"];

export const STATE_LABEL: Record<State, string> = {
  closed: "Closed",
  works: "Long closure",
  soon: "Closing soon",
  open: "Open",
};

export type HawkerStatus = {
  state: State;
  /** The closure covering the day, if any. */
  current: Closure | null;
  /** First day the hawker is open again (closed/works only). */
  reopens: string | null;
  /** The next closure starting after the day. */
  next: Closure | null;
  /** Days from the day to `next.start`. */
  daysUntilNext: number | null;
  /** Some slots this year are still "TBC" at source. */
  hasTbc: boolean;
};

const dated = (c: Closure): c is Closure & { start: string; end: string } => !!c.start && !!c.end;

export function closureLength(c: Closure): number {
  return c.start && c.end ? daysBetween(c.start, c.end) + 1 : 0;
}

export function closureLabel(c: Closure): string {
  if (c.kind === "cleaning") return c.quarter ? `Q${c.quarter} cleaning` : "Cleaning";
  if (c.remarks && /repair|redecorat/i.test(c.remarks)) return "Repairs & redecoration";
  if (c.remarks && /redevelop/i.test(c.remarks)) return "Redevelopment";
  if (c.remarks && /commence|opening/i.test(c.remarks)) return "Not yet open";
  return "Other works";
}

export function statusOn(hawker: Hawker, day: string): HawkerStatus {
  const windows = hawker.closures.filter(dated);
  const active = windows.filter((c) => c.start <= day && day <= c.end);
  const upcoming = windows.filter((c) => c.start > day).sort((a, b) => a.start.localeCompare(b.start));
  const next = upcoming[0] ?? null;
  const daysUntilNext = next ? daysBetween(day, next.start) : null;
  const hasTbc = hawker.closures.some((c) => c.tbc);

  if (active.length) {
    // Back-to-back windows (e.g. two blocks cleaned on consecutive days) count as one stretch.
    let end = active.reduce((max, c) => (c.end > max ? c.end : max), active[0].end);
    for (const c of upcoming) {
      if (c.start <= addDays(end, 1) && c.end > end) end = c.end;
    }
    const current = active.reduce((a, b) => (closureLength(b) > closureLength(a) ? b : a));
    const long = current.kind === "works" && closureLength(current) >= LONG_CLOSURE_DAYS;
    return {
      state: long ? "works" : "closed",
      current,
      reopens: addDays(end, 1),
      next: upcoming.find((c) => c.start > addDays(end, 1)) ?? null,
      daysUntilNext,
      hasTbc,
    };
  }

  return {
    state: next && daysUntilNext !== null && daysUntilNext <= SOON_DAYS ? "soon" : "open",
    current: null,
    reopens: null,
    next,
    daysUntilNext,
    hasTbc,
  };
}

export function isClosedState(state: State): boolean {
  return state === "closed" || state === "works";
}

/**
 * One line that says what matters, relative to the viewing day.
 * `today` lets copy say "today/tomorrow" when the viewing day is today.
 */
export function statusSentence(status: HawkerStatus, day: string, today: string): string {
  const year = Number(today.slice(0, 4));
  const rel = (iso: string) => (day === today ? relativeDays(today, iso) : formatDay(iso, year));

  if (status.state === "closed" || status.state === "works") {
    const what = status.current ? closureLabel(status.current).toLowerCase() : "closure";
    const verb = status.state === "works" ? `Closed for ${what}` : `Closed for ${what.replace(/^q\d /, "")}`;
    if (!status.reopens) return verb;
    const back = daysBetween(day, status.reopens) === 1 && day === today ? "tomorrow" : formatDay(status.reopens, year);
    return `${verb} · back ${back}`;
  }

  if (status.next?.start && status.next.end) {
    const label = closureLabel(status.next).replace(/^Q\d /, "");
    const range = formatRange(status.next.start, status.next.end, year);
    if (status.state === "soon") return `${capitalise(label)} ${rel(status.next.start)} · ${range}`;
    return `Next ${label.toLowerCase()} ${range}`;
  }

  return status.hasTbc ? "Next cleaning dates TBC" : "No upcoming closures";
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
