import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initRenderPulse, type ModeOption } from "react-render-pulse";
import { App } from "./App";

// Query params let the end-to-end tests steer the setup; a real app would
// hard-code these options.
const params = new URLSearchParams(location.search);

initRenderPulse({
  endpoint: params.get("endpoint") ?? "/api/render-pulse",
  sampleRate: Number(params.get("sampleRate") ?? 1),
  mode: (params.get("mode") as ModeOption | null) ?? "auto",
  appVersion: params.get("version") ?? import.meta.env.VITE_APP_VERSION ?? "dev",
  getRoute: () => location.pathname.replace(/\/\d+(?=\/|$)/g, "/:id"),
  debug: params.has("debug"),
});

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
