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
