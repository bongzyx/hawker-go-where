/**
 * The API contract, shared by the Worker (which produces it) and the frontend
 * (which consumes it). Raw data.gov.sg fields never leave the Worker.
 */

export type ClosureKind = "cleaning" | "works";

export type Closure = {
  kind: ClosureKind;
  /** 1–4 for quarterly cleaning, null for other works. */
  quarter: number | null;
  /** ISO dates (YYYY-MM-DD), inclusive. Null when the source says TBC/NA. */
  start: string | null;
  end: string | null;
  /** Source explicitly says "TBC" for this slot. */
  tbc: boolean;
  remarks: string | null;
};

export type Hawker = {
  /** Stable slug derived from the display name. Safe for URLs and Telegram start params. */
  id: string;
  /** Common name, e.g. "Hong Lim Food Centre and Market". */
  name: string;
  /** Location-style name from the source, e.g. "Upper Cross Street Blk 531A". */
  altName: string | null;
  address: string;
  postalCode: string | null;
  lat: number;
  lng: number;
  photoUrl: string | null;
  description: string | null;
  foodStalls: number;
  marketStalls: number;
  isNew: boolean;
  googleMapsUrl: string | null;
  closures: Closure[];
};

export type HawkersPayload = {
  version: 1;
  /** data.gov.sg's own last-modified timestamp for the dataset. */
  lastModified: string;
  /** When this Worker last pulled the source. */
  fetchedAt: string;
  count: number;
  hawkers: Hawker[];
};
