import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { HawkersPayload } from "../../shared/types";
import { todaySg } from "./dates";
import { cloud } from "./telegram";

const DATA_KEY = "hgw.data.v1";
const FAV_KEY = "hgw.favourites.v1";

function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota, the in-memory copy still works */
  }
}

/** Hawker data: last copy from this device first (instant, offline), then the network. */
export function useHawkers() {
  const [data, setData] = useState<HawkersPayload | null>(() => readLocal<HawkersPayload>(DATA_KEY));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/hawkers");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as HawkersPayload;
      setData(payload);
      setError(null);
      writeLocal(DATA_KEY, payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}

/** Today's date in Singapore, updated when the page comes back into view or the day rolls over. */
export function useToday(): string {
  const [today, setToday] = useState(todaySg);
  useEffect(() => {
    const tick = () => setToday(todaySg());
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return today;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
  );
}

/**
 * Favourites. Local first; inside Telegram also mirrored to CloudStorage so
 * they follow the user across devices, and so a future notifications backend
 * can be seeded from the same list.
 */
export function useFavourites() {
  const [ids, setIds] = useState<string[]>(() => readLocal<string[]>(FAV_KEY) ?? []);

  useEffect(() => {
    if (!cloud.available()) return;
    void cloud.get("favourites").then((raw) => {
      if (!raw) return;
      try {
        const remote = JSON.parse(raw) as string[];
        setIds((local) => {
          const merged = [...new Set([...local, ...remote])];
          writeLocal(FAV_KEY, merged);
          return merged;
        });
      } catch {
        /* ignore malformed cloud value */
      }
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      writeLocal(FAV_KEY, next);
      if (cloud.available()) cloud.set("favourites", JSON.stringify(next));
      return next;
    });
  }, []);

  return { ids, has: (id: string) => ids.includes(id), toggle };
}

export type LatLng = { lat: number; lng: number };

export function useGeolocation() {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<"idle" | "locating" | "ok" | "denied" | "unavailable">("idle");

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setStatus("ok");
      },
      (e) => setStatus(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  return { position, status, locate };
}

/** Great-circle distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
