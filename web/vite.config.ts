import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

/** Files from public/ the app needs offline. Hashed build output is added automatically. */
const PRECACHE_PUBLIC = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/fonts/InterVariable.woff2",
];

/**
 * Emits sw/sw.js as /sw.js with this build's file list baked in. The version is a
 * hash of that list, so every deploy that changes an asset installs a new worker
 * and drops the previous precache.
 */
function serviceWorker(): Plugin {
  return {
    name: "hgw-service-worker",
    apply: "build",
    applyToEnvironment: (env) => env.name === "client",
    generateBundle(_, bundle) {
      const built = Object.keys(bundle)
        .filter((f) => f.startsWith("assets/") && !f.endsWith(".map"))
        .map((f) => `/${f}`);
      const precache = [...PRECACHE_PUBLIC, ...built.sort()];
      const version = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);
      const source = readFileSync(new URL("./sw/sw.js", import.meta.url), "utf8")
        .replace("__HGW_VERSION__", version)
        .replace("__HGW_PRECACHE__", JSON.stringify(precache));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

// `vite` runs the Worker (API) and the frontend together on one origin via the
// Cloudflare plugin, exactly as they run in production. `vite build` emits the
// client to dist/client and the Worker to dist/hawker_go_where, which is what
// `wrangler deploy` picks up.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), serviceWorker()],
  // MapLibre v6 loads its worker via `new URL("./maplibre-gl-worker.mjs", import.meta.url)`.
  // Pre-bundling moves the main file into .vite/deps without the worker, so the
  // map silently renders nothing in dev. Serve it as-is instead.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  server: {
    // Reachable from a phone on the same Wi-Fi, and through a tunnel
    // (cloudflared/ngrok), Telegram Mini Apps need HTTPS.
    host: true,
    port: 5181,
    strictPort: true,
    allowedHosts: true,
  },
});
