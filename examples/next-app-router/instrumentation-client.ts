import { initRenderPulse } from "react-render-pulse";

// Next.js runs this file in the browser before the app hydrates, so the very
// first renders are measured. (On older Next.js versions, call
// initRenderPulse at the top level of a "use client" module your root layout imports.)
initRenderPulse({
  endpoint: "/api/render-pulse",
  sampleRate: Number(process.env.NEXT_PUBLIC_RENDER_PULSE_SAMPLE_RATE ?? 1),
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
  // Route templates keep dynamic segments together: /orders/42 → /orders/[id].
  getRoute: () => location.pathname.replace(/^\/orders\/[^/]+/, "/orders/[id]"),
});
