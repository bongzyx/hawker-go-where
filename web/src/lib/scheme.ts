import { useSyncExternalStore } from "react";

/** `data-scheme` on <html> is the single source of truth; the host (Telegram or OS) writes it. */
const listeners = new Set<() => void>();

export function setScheme(dark: boolean) {
  const root = document.documentElement;
  const next = dark ? "dark" : "light";
  if (root.dataset.scheme === next) return;
  root.dataset.scheme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1c1c1c" : "#ffffff");
  // Solid either way; see index.html for why never "black-translucent".
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute("content", dark ? "black" : "default");
  listeners.forEach((l) => l());
}

export function useDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => document.documentElement.dataset.scheme === "dark",
  );
}
