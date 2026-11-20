import type { Closure, Hawker, HawkersPayload } from "./types";

/** The raw record shape written by check_for_updates.py (CSV columns from data.gov.sg). */
export type RawRecord = Record<string, string | undefined>;
export type RawPayload = { last_modified: string; records: RawRecord[] };

const PLACEHOLDER = /^(nil|na|n\/a|#n\/a|-|tbc|null)?$/i;

/** Trim, collapse whitespace, and turn the source's many spellings of "nothing" into null. */
export function clean(value: string | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return PLACEHOLDER.test(text) ? null : text;
}

/** "7/12/2026" → "2026-12-07". Anything else → null, flagging an explicit TBC. */
export function parseDate(value: string | undefined): { iso: string | null; tbc: boolean } {
  const text = (value ?? "").trim();
  if (/^tbc$/i.test(text)) return { iso: null, tbc: true };
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!match) return { iso: null, tbc: false };
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { iso: null, tbc: false };
  return { iso: `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, tbc: false };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56)
    .replace(/-+$/g, "");
}

/** "Upper Cross Street Blk 531A (Hong Lim Food Centre and Market)" → common name + location name. */
export function splitName(raw: string): { name: string; altName: string | null } {
  const text = raw.replace(/\s+/g, " ").trim();
  const match = /^(.*?)\s*\((.+)\)\s*$/.exec(text);
  if (!match || !match[1]) return { name: text, altName: null };
  return { name: match[2].trim(), altName: match[1].trim() };
}

function toInt(value: string | undefined): number {
  const n = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toUrl(value: string | undefined): string | null {
  const text = clean(value);
  if (!text || !/^https?:\/\//i.test(text)) return null;
  // NEA serves the same images over https; mixed content is blocked in Telegram.
  return text.replace(/^http:\/\//i, "https://");
}

function closuresOf(record: RawRecord): Closure[] {
  const closures: Closure[] = [];

  for (const q of [1, 2, 3, 4]) {
    const start = parseDate(record[`q${q}_cleaningstartdate`]);
    const end = parseDate(record[`q${q}_cleaningenddate`]);
    const remarks = clean(record[`remarks_q${q}`]);
    if (!start.iso && !start.tbc && !remarks) continue;
    closures.push({
      kind: "cleaning",
      quarter: q,
      start: start.iso,
      end: end.iso ?? start.iso,
      tbc: !start.iso,
      remarks,
    });
  }

  const start = parseDate(record.other_works_startdate);
  const end = parseDate(record.other_works_enddate);
  const remarks = clean(record.remarks_other_works);
  if (start.iso || start.tbc || remarks) {
    closures.push({
      kind: "works",
      quarter: null,
      start: start.iso,
      end: end.iso ?? start.iso,
      tbc: !start.iso,
      remarks,
    });
  }

  return closures.sort((a, b) => (a.start ?? "9999").localeCompare(b.start ?? "9999"));
}

export function normalize(raw: RawPayload, fetchedAt = new Date()): HawkersPayload {
  const seen = new Map<string, number>();
  const hawkers: Hawker[] = [];

  for (const record of raw.records ?? []) {
    const rawName = clean(record.name);
    const lat = Number.parseFloat(record.latitude_hc ?? "");
    const lng = Number.parseFloat(record.longitude_hc ?? "");
    if (!rawName || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const { name, altName } = splitName(rawName);
    let id = slugify(name) || `hawker-${record.serial_no ?? hawkers.length}`;
    const dupes = seen.get(id) ?? 0;
    seen.set(id, dupes + 1);
    if (dupes) id = `${id}-${dupes + 1}`;

    const address = clean(record.address_myenv) ?? "";

    hawkers.push({
      id,
      name,
      altName,
      address,
      postalCode: /\b(\d{6})\b/.exec(address)?.[1] ?? null,
      lat,
      lng,
      photoUrl: toUrl(record.photourl),
      description: clean(record.description_myenv),
      foodStalls: toInt(record.no_of_food_stalls),
      marketStalls: toInt(record.no_of_market_stalls),
      isNew: /new/i.test(record.status ?? ""),
      googleMapsUrl: toUrl(record.google_3d_view),
      closures: closuresOf(record),
    });
  }

  hawkers.sort((a, b) => a.name.localeCompare(b.name));

  return {
    version: 1,
    lastModified: raw.last_modified,
    fetchedAt: fetchedAt.toISOString(),
    count: hawkers.length,
    hawkers,
  };
}
