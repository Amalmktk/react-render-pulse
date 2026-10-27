import { createRoot } from "react-dom/client";
import { initRenderPulse, type Payload } from "react-render-pulse";
import { App } from "./App";
import { setUpBench } from "./bench";

declare const __PULSE_MODE__: "lightweight" | "profiling";

let lastPayload: Payload | null = null;

const pulse = initRenderPulse({
  mode: __PULSE_MODE__,
  // `?sampled=0` keeps the monitors in the tree but turns measuring off,
  // separating the cost of the components from the cost of measuring.
  sampleRate: new URLSearchParams(location.search).get("sampled") === "0" ? 0 : 1,
  flushIntervalMs: 0,
  debug: false,
  exporters: [{ onFlush: (payload) => void (lastPayload = payload) }],
});

setUpBench({
  variant: __PULSE_MODE__,
  // Drains what the run measured, for the accuracy check.
  collect: () => {
    pulse.flush();
    const payload = lastPayload;
    lastPayload = null;
    return payload;
  },
  mode: () => pulse.mode,
});

// No StrictMode: its double renders in development would skew `pnpm dev` comparisons.
createRoot(document.getElementById("root") as HTMLElement).render(<App />);
