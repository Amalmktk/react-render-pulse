# react-render-pulse

[![npm version](https://img.shields.io/npm/v/react-render-pulse?color=cb3837&logo=npm)](https://www.npmjs.com/package/react-render-pulse)
[![CI](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml/badge.svg)](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-render-pulse)](https://github.com/Amalmktk/react-render-pulse/blob/main/LICENSE)

Real-user render performance monitoring for React, at the component level. Wrap the parts of your tree you care about and get render timings from real sessions: render counts, slow renders, p50/p75/p95 and the slowest renders per area and route, plus long tasks attributed to the area that was rendering.

Under 3.75 kB brotli. No runtime dependencies besides React 18 or 19.

## Install

```bash
npm install react-render-pulse
```

## Usage

Start it once, in the browser, before your app renders:

```tsx
import { createRoot } from "react-dom/client";
import { initRenderPulse } from "react-render-pulse";
import { App } from "./App";

initRenderPulse({
  endpoint: "/api/render-pulse", // leave out to log batches to the console
  sampleRate: 0.1, // 10% of page loads
  appVersion: import.meta.env.VITE_APP_VERSION,
});

createRoot(document.getElementById("root")!).render(<App />);
```

Wrap areas you want timings for:

```tsx
import { RenderMonitor, useRenderMonitor } from "react-render-pulse";

export function OrdersPage() {
  return (
    <RenderMonitor id="orders-table">
      <OrdersTable />
    </RenderMonitor>
  );
}

function PriceChart() {
  useRenderMonitor("price-chart"); // exact render count; duration is an upper bound
  return <Chart />;
}
```

`<RenderMonitor>` adds no DOM elements and never remounts its children. Errors inside the package never reach your app.

Batches are sent when the page is hidden and every 3 minutes while it's visible. Send them to [`react-render-pulse-collector`](https://www.npmjs.com/package/react-render-pulse-collector) and read them with [`react-render-pulse-viewer`](https://www.npmjs.com/package/react-render-pulse-viewer).

## Key options

| Option | Default | Description |
| --- | --- | --- |
| `endpoint` | none | Where batches are `POST`ed. Without one, batches are logged to the console. |
| `sampleRate` | `1` | Fraction of page loads that collect anything. |
| `mode` | `"auto"` | `"lightweight"`, `"profiling"`, or `"auto"`: lightweight until React's profiling build is detected. |
| `slowRenderMs` | `16` | Renders slower than this count as slow. |
| `longTaskMs` | `50` | Shorter long tasks and long animation frames are ignored. |
| `appVersion` | none | Your app's version, for comparing releases. |
| `getRoute` | numeric path segments → `:id` | Returns the current route template, e.g. `/orders/:id`. |
| `exporters` | `[]` | Extra receivers, e.g. `createOtelExporter` from `react-render-pulse/otel`. |

All options: [client API reference](https://github.com/Amalmktk/react-render-pulse/blob/main/docs/api/client.md).

## Modes

- **Lightweight** (any production build): times each area between two marker components. About 10–15 µs per measured render. Doesn't see updates that start inside the area.
- **Profiling** (React's profiling build): React's `<Profiler>` timings for every commit. Exact, but the profiling build itself costs more; use it for a sampled group.

Enable the profiling build by aliasing `react-dom/client` to `react-dom/profiling` (Vite) or with `next build --profile`. See [Modes](https://github.com/Amalmktk/react-render-pulse/blob/main/docs/guide/modes.md).

## Entry points

| Import | Contents |
| --- | --- |
| `react-render-pulse` | `initRenderPulse`, `RenderMonitor`, `useRenderMonitor`, `createConsoleExporter`, types. Marked `"use client"`. |
| `react-render-pulse/core` | Types, `HISTOGRAM_BOUNDS`, `histogramPercentile`. No React; safe on servers. |
| `react-render-pulse/otel` | `createOtelExporter`, for OpenTelemetry metrics. |

## Privacy

No user IDs, IP addresses, page text, input values or query strings. The session id is random per page load and never stored. Routes come from `location.pathname`; numeric segments are replaced by default, but pass a `getRoute` if paths can contain names, slugs or UUIDs. See [What we collect](https://github.com/Amalmktk/react-render-pulse/blob/main/docs/guide/what-we-collect.md).

## Documentation

Full docs: https://github.com/Amalmktk/react-render-pulse/tree/main/docs

## License

MIT © Amal M
