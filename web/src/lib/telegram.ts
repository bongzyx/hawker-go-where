/**
 * Everything host-specific, behind one module.
 *
 * The page runs as a Telegram Mini App or a plain web page. Components call the
 * helpers here and never touch `window.Telegram` themselves, so every Bot API
 * feature is version-gated in one place and is a no-op in a browser.
 */

type EventName = "themeChanged" | "safeAreaChanged" | "contentSafeAreaChanged" | "viewportChanged" | "fullscreenChanged";

type Insets = { top: number; bottom: number; left: number; right: number };

type TgWebApp = {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name?: string } };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string | undefined>;
  isExpanded: boolean;
  isFullscreen?: boolean;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  onEvent(event: EventName, cb: () => void): void;
  offEvent(event: EventName, cb: () => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback: {
    selectionChanged(): void;
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
  CloudStorage?: {
    getItem(key: string, cb: (error: string | null, value?: string) => void): void;
    setItem(key: string, value: string, cb?: (error: string | null, ok?: boolean) => void): void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

function webApp(): TgWebApp | null {
  const app = window.Telegram?.WebApp;
  // telegram-web-app.js defines WebApp in any browser; only a real launch has initData.
  return app && app.initData ? app : null;
}

const at = (version: string) => !!webApp()?.isVersionAtLeast(version);

export function isTelegram(): boolean {
  return webApp() !== null;
}

export function startParam(): string | null {
  return webApp()?.initDataUnsafe.start_param ?? null;
}

function setVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

/**
 * Only Telegram's light/dark choice is taken; the palette stays ours (as in
 * Huat Master), so the app looks the same in Telegram as installed or in a
 * browser. Telegram's own chrome is painted to match.
 */
function bindTheme(app: TgWebApp, onScheme: (dark: boolean) => void) {
  const apply = () => {
    const dark = app.colorScheme === "dark";
    onScheme(dark);
    const bg = dark ? "#1c1c1c" : "#ffffff";
    if (at("6.1")) {
      app.setHeaderColor?.(bg);
      app.setBackgroundColor?.(bg);
    }
    if (at("7.10")) app.setBottomBarColor?.(bg);
  };
  apply();
  app.onEvent("themeChanged", apply);
}

/**
 * Telegram on iPhone has been seen reporting a zero or too-small bottom inset while the page
 * still runs under the home indicator. Face ID iPhones are at least 812pt tall;
 * their indicator needs 34pt in portrait and 21pt in landscape.
 */
function homeIndicator(app: TgWebApp): number {
  if (app.platform !== "ios") return 0;
  const long = Math.max(screen.width, screen.height);
  const short = Math.min(screen.width, screen.height);
  if (long < 812 || short >= 500) return 0;
  return screen.height >= screen.width ? 34 : 21;
}

/** Device insets and Telegram's own header, mirrored onto CSS variables. */
function bindInsets(app: TgWebApp) {
  if (!at("8.0")) return;
  const apply = () => {
    const d = app.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const c = app.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
    setVar("--host-safe-top", `${d.top}px`);
    setVar("--host-safe-bottom", `${Math.max(d.bottom + c.bottom, homeIndicator(app))}px`);
    setVar("--host-safe-left", `${d.left}px`);
    setVar("--host-safe-right", `${d.right}px`);
    setVar("--content-safe-top", `${c.top}px`);
  };
  apply();
  app.onEvent("safeAreaChanged", apply);
  app.onEvent("contentSafeAreaChanged", apply);
}

/** Detect the host and wire it up. Never throws. */
export function initHost(onScheme: (dark: boolean) => void): "telegram" | "browser" {
  const app = webApp();
  if (!app) {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    onScheme(query.matches);
    query.addEventListener("change", (e) => onScheme(e.matches));
    return "browser";
  }

  document.documentElement.dataset.host = "telegram";
  try {
    bindTheme(app, onScheme);
    bindInsets(app);
    app.ready();
    app.expand();
    // Without this, panning the map downwards minimises the Mini App.
    if (at("7.7")) app.disableVerticalSwipes?.();
    // The map wants the whole screen. Phones only: on desktop, fullscreen would
    // take over the window. Telegram's own buttons then float over the top
    // edge, which --content-safe-top already keeps the search bar clear of.
    if (at("8.0") && (app.platform === "ios" || app.platform === "android") && !app.isFullscreen) {
      app.requestFullscreen?.();
    }
  } catch (error) {
    console.warn("Telegram init failed", error);
  }
  return "telegram";
}

export const haptics = {
  select() {
    if (at("6.1")) webApp()?.HapticFeedback.selectionChanged();
  },
  tap() {
    if (at("6.1")) webApp()?.HapticFeedback.impactOccurred("light");
  },
  success() {
    if (at("6.1")) webApp()?.HapticFeedback.notificationOccurred("success");
  },
};

/** Show Telegram's native back button while `active`; calls `onBack` when pressed. */
export function bindBackButton(active: boolean, onBack: () => void): () => void {
  const app = webApp();
  if (!app || !at("6.1")) return () => {};
  if (!active) {
    app.BackButton.hide();
    return () => {};
  }
  app.BackButton.show();
  app.BackButton.onClick(onBack);
  return () => {
    app.BackButton.offClick(onBack);
    app.BackButton.hide();
  };
}

/** External links leave Telegram through its own browser; a plain <a> would be swallowed. */
export function openExternal(url: string) {
  const app = webApp();
  if (app) app.openLink(url);
  else window.open(url, "_blank", "noopener");
}

export async function share(url: string, text: string): Promise<"shared" | "copied" | "failed"> {
  const app = webApp();
  if (app) {
    app.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
    return "shared";
  }
  if (navigator.share) {
    try {
      await navigator.share({ url, text });
      return "shared";
    } catch {
      /* cancelled, fall through to copy */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Telegram CloudStorage (syncs across the user's devices), or null outside Telegram. */
export const cloud = {
  available: () => at("6.9") && !!webApp()?.CloudStorage,
  get(key: string): Promise<string | null> {
    return new Promise((resolve) => {
      const store = webApp()?.CloudStorage;
      if (!store) return resolve(null);
      store.getItem(key, (error, value) => resolve(error ? null : value || null));
    });
  },
  set(key: string, value: string) {
    webApp()?.CloudStorage?.setItem(key, value);
  },
};
