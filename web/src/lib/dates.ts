/**
 * Calendar dates as ISO strings (YYYY-MM-DD), always in Singapore time.
 * ISO strings compare correctly as plain strings, which is all the status
 * logic needs; arithmetic goes through UTC midnight so DST never matters.
 */

const SG = "Asia/Singapore";

export function todaySg(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SG }).format(now);
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function dayOfYear(iso: string): number {
  const year = iso.slice(0, 4);
  return daysBetween(`${year}-01-01`, iso);
}

export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", ...opts });

const weekdayShort = fmt({ weekday: "short" });
const weekdayNarrow = fmt({ weekday: "narrow" });
const dayMonth = fmt({ day: "numeric", month: "short" });
const dayMonthYear = fmt({ day: "numeric", month: "short", year: "numeric" });

export function weekday(iso: string, style: "short" | "narrow" = "short"): string {
  return (style === "short" ? weekdayShort : weekdayNarrow).format(toUtc(iso));
}

export function dayNumber(iso: string): number {
  return toUtc(iso).getUTCDate();
}

/** "Mon 7 Dec" (adds the year when it is not the reference year). */
export function formatDay(iso: string, refYear?: number): string {
  const date = toUtc(iso);
  const withYear = refYear !== undefined && date.getUTCFullYear() !== refYear;
  return `${weekdayShort.format(date)} ${(withYear ? dayMonthYear : dayMonth).format(date)}`;
}

/** "Mon 7 – Tue 8 Dec", "Mon 7 Dec", "Mon 30 Nov – Tue 1 Dec". */
export function formatRange(start: string, end: string, refYear?: number): string {
  if (start === end) return formatDay(start, refYear);
  const a = toUtc(start);
  const b = toUtc(end);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return `${weekdayShort.format(a)} ${a.getUTCDate()} – ${formatDay(end, refYear)}`;
  }
  return `${formatDay(start, refYear)} – ${formatDay(end, refYear)}`;
}

/** "today", "tomorrow", "in 3 days", "yesterday", "3 days ago". */
export function relativeDays(from: string, to: string): string {
  const n = daysBetween(from, to);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 0) return n < 14 ? `in ${n} days` : n < 60 ? `in ${Math.round(n / 7)} weeks` : `in ${Math.round(n / 30)} months`;
  return `${-n} days ago`;
}

export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: SG,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
