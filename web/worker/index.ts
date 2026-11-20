/**
 * HawkerGoWhere API + static frontend, one Worker.
 *
 *   GET /api/hawkers              all hawkers, normalised (see shared/types.ts)
 *   GET /api/hawkers/:id          one hawker
 *   GET /api/closures?date=…      hawkers closed on a date (YYYY-MM-DD, default today SGT)
 *   GET /api/health               source freshness
 *
 * Source data is the JSON that check_for_updates.py commits to GitHub. It is
 * fetched with an optional token (private repo), normalised once, and cached in
 * three layers: isolate memory → Cache API → GitHub. Stale copies are served
 * immediately while a refresh runs in the background, and served on upstream
 * failure, so a GitHub blip never takes the page down.
 */

import { normalize, type RawPayload } from "../shared/normalize";
import type { Hawker, HawkersPayload } from "../shared/types";

export interface Env {
  ASSETS: Fetcher;
  DATA_URL: string;
  GITHUB_TOKEN?: string;
  CACHE_TTL_SECONDS?: string;
}

/** Stale copies are usable for this long after they stop being fresh. */
const MAX_STALE_SECONDS = 24 * 60 * 60;
/** Bump when the normalised shape changes so old cache entries are ignored. */
const CACHE_KEY = "https://hawker-go-where.internal/cache/hawkers/v1";

type Cached = { payload: HawkersPayload; body: string; etag: string; storedAt: number };

let memory: Cached | null = null;
let inflight: Promise<Cached> | null = null;

function ttlMs(env: Env): number {
  const seconds = Number(env.CACHE_TTL_SECONDS ?? "900");
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 900) * 1000;
}

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .slice(0, 10)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchUpstream(env: Env): Promise<Cached> {
  const headers: Record<string, string> = {
    "User-Agent": "hawker-go-where-worker",
    Accept: "application/json",
  };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

  const response = await fetch(env.DATA_URL, { headers, cf: { cacheTtl: 0 } });
  if (!response.ok) throw new Error(`Upstream ${response.status} ${response.statusText}`);

  const raw = (await response.json()) as RawPayload;
  if (!raw || !Array.isArray(raw.records)) throw new Error("Upstream payload has no records");

  const payload = normalize(raw);
  // The ETag ignores fetchedAt so clients keep their copy until the data changes.
  const etag = `"${await hash(JSON.stringify(payload.hawkers) + payload.lastModified)}"`;
  return { payload, body: JSON.stringify(payload), etag, storedAt: Date.now() };
}

async function readCacheApi(): Promise<Cached | null> {
  try {
    const hit = await caches.default.match(CACHE_KEY);
    if (!hit) return null;
    const body = await hit.text();
    return {
      payload: JSON.parse(body) as HawkersPayload,
      body,
      etag: hit.headers.get("x-etag") ?? "",
      storedAt: Number(hit.headers.get("x-stored-at") ?? 0),
    };
  } catch {
    return null;
  }
}

async function writeCacheApi(entry: Cached): Promise<void> {
  try {
    await caches.default.put(
      CACHE_KEY,
      new Response(entry.body, {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${MAX_STALE_SECONDS}`,
          "x-etag": entry.etag,
          "x-stored-at": String(entry.storedAt),
        },
      }),
    );
  } catch {
    // Cache API is unavailable on some hosts (e.g. *.workers.dev). Memory still works.
  }
}

function refresh(env: Env): Promise<Cached> {
  inflight ??= fetchUpstream(env)
    .then(async (entry) => {
      memory = entry;
      await writeCacheApi(entry);
      return entry;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function getData(env: Env, ctx: ExecutionContext, force = false): Promise<{ entry: Cached; stale: boolean }> {
  if (force) return { entry: await refresh(env), stale: false };

  const now = Date.now();
  let entry = memory;
  if (!entry || now - entry.storedAt > ttlMs(env)) {
    const fromCache = await readCacheApi();
    if (fromCache && (!entry || fromCache.storedAt > entry.storedAt)) entry = memory = fromCache;
  }

  if (entry) {
    const age = now - entry.storedAt;
    if (age <= ttlMs(env)) return { entry, stale: false };
    if (age <= ttlMs(env) + MAX_STALE_SECONDS * 1000) {
      ctx.waitUntil(refresh(env).catch((error) => console.error("background refresh failed", error)));
      return { entry, stale: true };
    }
  }

  try {
    return { entry: await refresh(env), stale: false };
  } catch (error) {
    if (entry) {
      console.error("refresh failed, serving stale copy", error);
      return { entry, stale: true };
    }
    throw error;
  }
}

/** Today in Singapore, as YYYY-MM-DD. */
function todaySg(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
}

function closedOn(hawker: Hawker, date: string) {
  return hawker.closures.filter((c) => c.start && c.end && c.start <= date && date <= c.end);
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "content-type, if-none-match",
  "access-control-expose-headers": "etag, x-data-stale",
};

function json(body: unknown, init: ResponseInit & { etag?: string; stale?: boolean } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  if (init.etag) headers.set("etag", init.etag);
  if (init.stale) headers.set("x-data-stale", "1");
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=300, stale-while-revalidate=86400");
  }
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { ...init, headers });
}

function error(status: number, message: string): Response {
  return json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET" && request.method !== "HEAD") return error(405, "Method not allowed");

  let data: { entry: Cached; stale: boolean };
  try {
    data = await getData(env, ctx);
  } catch (e) {
    console.error("no data available", e);
    return error(502, "Hawker data is temporarily unavailable");
  }
  const { entry, stale } = data;

  if (path === "/api/health") {
    return json(
      {
        ok: true,
        count: entry.payload.count,
        lastModified: entry.payload.lastModified,
        fetchedAt: entry.payload.fetchedAt,
        stale,
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  if (path === "/api/hawkers") {
    if (request.headers.get("if-none-match") === entry.etag) {
      return new Response(null, { status: 304, headers: { ...CORS, etag: entry.etag } });
    }
    return json(entry.body, { etag: entry.etag, stale });
  }

  const one = /^\/api\/hawkers\/([a-z0-9-]+)$/.exec(path);
  if (one) {
    const hawker = entry.payload.hawkers.find((h) => h.id === one[1]);
    if (!hawker) return error(404, "Hawker not found");
    return json({ lastModified: entry.payload.lastModified, hawker }, { stale });
  }

  if (path === "/api/closures") {
    const date = url.searchParams.get("date") ?? todaySg();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return error(400, "date must be YYYY-MM-DD");
    const closed = entry.payload.hawkers
      .map((h) => ({ hawker: h, closures: closedOn(h, date) }))
      .filter((x) => x.closures.length)
      .map(({ hawker, closures }) => ({
        id: hawker.id,
        name: hawker.name,
        address: hawker.address,
        closures,
      }));
    return json({ date, lastModified: entry.payload.lastModified, count: closed.length, closed }, { stale });
  }

  return error(404, "Not found");
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
