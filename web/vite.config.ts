import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `vite` runs the Worker (API) and the frontend together on one origin via the
// Cloudflare plugin, exactly as they run in production. `vite build` emits the
// client to dist/client and the Worker to dist/hawker_go_where, which is what
// `wrangler deploy` picks up.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
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
