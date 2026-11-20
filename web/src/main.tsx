import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { setScheme } from "./lib/scheme";
import { initHost } from "./lib/telegram";
import "./styles.css";

initHost(setScheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline shell + installability. Built only for production (see vite.config.ts).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker failed", error));
  });
}
