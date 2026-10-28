# react-render-pulse

[![npm version](https://img.shields.io/npm/v/react-render-pulse?color=cb3837&logo=npm)](https://www.npmjs.com/package/react-render-pulse)
[![CI](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml/badge.svg)](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-render-pulse)](https://github.com/Amalmktk/react-render-pulse/blob/main/LICENSE)

**Find the React components that slow your app down — on real users' devices.**

React DevTools shows how your app performs on your machine. react-render-pulse shows how it performs for your users: it measures named areas of your component tree in production, summarizes the timings in the browser, and sends small batches to an endpoint you control. You get render counts, slow renders, p50/p75/p95 and the slowest renders per area and route, plus long tasks blamed on the area that was rendering, by device class and app version.

- About **10 µs per measured render** in lightweight mode, and **3.6 kB** (brotli) for the client
- **Privacy-friendly:** no user IDs, IP addresses, page text, input values or query strings
- **Never breaks your app:** every internal error is caught; missing browser APIs are handled
- React 18 and 19, ESM and CommonJS, fully typed, `"use client"` ready for Next.js

📖 **Docs:** https://amalmktk.github.io/react-render-pulse/

**Contents:** [Install](#install) · [Quick start](#quick-start) · [How it works](#how-it-works) · [Collecting results](#collecting-results) · [API](#api) · [Modes](#modes) · [Frameworks](#frameworks) · [What gets sent](#what-gets-sent) · [Performance](#performance) · [Limitations](#limitations)

## Install

```bash
npm install react-render-pulse
```

React 18 or 19 is a peer dependency. There are no other runtime dependencies.

## Quick start

**1. Start it once,** in the browser, before your app renders:

```tsx
// src/main.tsx
import { createRoot } from "react-dom/client";
import { initRenderPulse } from "react-render-pulse";
import { App } from "./App";

initRenderPulse({
  endpoint: "/api/render-pulse", // leave out to log batches to the console instead
  sampleRate: 0.1, // 10% of page loads
  appVersion: import.meta.env.VITE_APP_VERSION, // compare releases
});

createRoot(document.getElementById("root")!).render(<App />);
```

**2. Wrap the areas you care about.** Areas can be nested:

```tsx
import { RenderMonitor } from "react-render-pulse";

export function OrdersPage() {
  return (
    <RenderMonitor id="orders-page">
      <Filters />
      <RenderMonitor id="orders-table">
        <OrdersTable />
      </RenderMonitor>
    </RenderMonitor>
  );
}
```

Or track a single component with the hook:

```tsx
import { useRenderMonitor } from "react-render-pulse";

function PriceChart() {
  useRenderMonitor("price-chart");
  return <Chart />;
}
```

**3. Try it.** Without an `endpoint`, use the page, then switch tabs: the batch is logged to the console as a table, slowest areas first. With an `endpoint`, it's `POST`ed there; see [Collecting results](#collecting-results).

`<RenderMonitor>` adds no DOM elements and never remounts its children, in any mode, whether or not the session is sampled.

## How it works

```
 <RenderMonitor> / useRenderMonitor ──► in-memory aggregator ──► batch ──► your endpoint ──► storage ──► viewer / SQL
        render timings                   per area + route:        sent on page hide        (react-render-pulse-collector)
 PerformanceObserver ──► long tasks      histogram, counts,       (sendBeacon) and every
   and long animation frames,            worst cases              3 minutes (fetch keepalive)
   blamed on the area rendering
```

1. **Sample:** once per page load, decide whether to measure (`sampleRate`). Unsampled sessions do almost nothing.
2. **Measure:** time each monitored area's renders (see [Modes](#modes)) and observe long tasks.
3. **Aggregate:** keep counts, a 16-bucket histogram and the 5 slowest renders per area + route, never raw events. Memory stays flat.
4. **Send:** when the page is hidden, and every 3 minutes while it's open. Batches are trimmed to 60 KB, sent with `sendBeacon` (falling back to `fetch` with `keepalive`), and retried on `429`/`5xx`.

Full details: [Architecture](https://amalmktk.github.io/react-render-pulse/guide/architecture).

## Collecting results

Batches need somewhere to go. You can use the companion packages, your own endpoint, or OpenTelemetry.

**With [`react-render-pulse-collector`](https://www.npmjs.com/package/react-render-pulse-collector)**, a standard `Request` → `Response` handler that validates and stores batches. On Next.js:

```ts
// app/api/render-pulse/route.ts
import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

const collect = createCollector({ storage: postgresStorage({ url: process.env.DATABASE_URL! }) });

export const POST = collect;
export const OPTIONS = collect;
```

It also runs on Vercel, Netlify, Cloudflare Workers and Express, and stores to Postgres or a JSON Lines file.

**Read them with [`react-render-pulse-viewer`](https://www.npmjs.com/package/react-render-pulse-viewer):**

```bash
npx react-render-pulse-viewer report --db "$DATABASE_URL" --since 7d   # terminal tables
npx react-render-pulse-viewer serve --db "$DATABASE_URL"               # web viewer on 127.0.0.1:4173
```

**Or query Postgres yourself.** Each batch is one row with the payload as `jsonb`:

```sql
SELECT a->>'id' AS area, a->>'route' AS route,
       sum((a->>'renders')::int) AS renders,
       round(100.0 * sum((a->>'slow')::int) / nullif(sum((a->>'renders')::int), 0), 1) AS slow_pct
FROM render_pulse_batches b
CROSS JOIN LATERAL jsonb_array_elements(b.payload->'areas') AS a
WHERE b.received_at > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY slow_pct DESC NULLS LAST;
```

**Or send to OpenTelemetry** with `createOtelExporter` (below). No collector is needed.

Step-by-step guide, more SQL, and troubleshooting: [Collecting results](https://amalmktk.github.io/react-render-pulse/guide/collecting-results).

## API

### `initRenderPulse(options?)`

Starts measuring. Call it once, in the browser, before your app renders. Calling it again replaces the previous setup. On the server it does nothing.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `endpoint` | `string` | — | Where batches are `POST`ed. Without one, batches only go to `exporters` and the console. |
| `sampleRate` | `number` (0–1) | `1` | Fraction of page loads that measure anything, decided once per page load. |
| `mode` | `"auto" \| "lightweight" \| "profiling"` | `"auto"` | How renders are measured. See [Modes](#modes). |
| `slowRenderMs` | `number` | `16` | Renders slower than this count as slow (one frame at 60 Hz). |
| `longTaskMs` | `number` | `50` | Shorter long tasks and long animation frames are ignored. |
| `appVersion` | `string` | — | Your app's version, for comparing releases. |
| `getRoute` | `() => string` | path with numeric segments → `:id` | The current route, ideally a template like `/orders/:id`. |
| `flushIntervalMs` | `number` | `180000` | Also send this often while the page is open. `0` sends only when it's hidden. |
| `maxPayloadBytes` | `number` | `60000` | Largest batch; bigger ones are trimmed. Capped at 65536. |
| `maxAreas` | `number` | `200` | Most area + route pairs per batch. Capped at 1000. |
| `worstCases` | `number` | `5` | Slowest renders kept per area per batch. Capped at 50. |
| `exporters` | `Exporter[]` | — | Receive measurements and batches, e.g. `createOtelExporter`. |
| `debug` | `boolean` | `true` without `endpoint` | Log each batch to the console, and internal errors as warnings. |

Returns `{ sampled, mode, flush(), destroy() }`:

- `sampled`: whether this page load measures anything.
- `mode`: the current mode; in `"auto"` it changes to `"profiling"` once React's profiling build is detected.
- `flush()`: sends a batch now and returns it, or `null` if nothing was measured.
- `destroy()`: stops observing and sending. Monitors keep rendering their children.

### `<RenderMonitor id children />`

Measures the renders of its children as one area named `id`. Areas with the same `id` are reported together. Nested areas are reported separately, and an outer area's time includes its inner ones.

### `useRenderMonitor(id)`

Measures the component that calls it. Render counts are exact. The duration runs from the hook to the commit, so it's an upper bound that can include components rendered after it in the same update.

### Exporters

An exporter receives data as it's measured:

```ts
interface Exporter {
  onRender?: (event: RenderEvent) => void; // every measured render
  onLongTask?: (event: LongTaskEvent) => void; // every long task / long animation frame
  onFlush?: (payload: Payload) => void; // every batch
}
```

Built in:

- `createConsoleExporter()` logs each batch as a table. It's used automatically when `debug` is on.
- `createOtelExporter({ meter, slowRenderMs? })` from `react-render-pulse/otel` records OpenTelemetry metrics: `render_pulse.render.duration` and `render_pulse.longtask.duration` (histograms, ms) and `render_pulse.render.slow` (counter), with area, route, phase and mode attributes.

```ts
import { metrics } from "@opentelemetry/api";
import { createOtelExporter } from "react-render-pulse/otel";

initRenderPulse({ exporters: [createOtelExporter({ meter: metrics.getMeter("my-app") })] });
```

### Entry points

| Import | Contents |
| --- | --- |
| `react-render-pulse` | `initRenderPulse`, `RenderMonitor`, `useRenderMonitor`, `createConsoleExporter`, `HISTOGRAM_BOUNDS`, `histogramPercentile`, and all types. Marked `"use client"`. |
| `react-render-pulse/core` | Types, `HISTOGRAM_BOUNDS`, `histogramPercentile`. No React; safe in servers and Server Components. |
| `react-render-pulse/otel` | `createOtelExporter`. |

Types: `Payload`, `AreaReport`, `LongTaskReport`, `SessionInfo`, `SessionSummary`, `DeviceContext`, `WorstCase`, `RenderEvent`, `LongTaskEvent`, `Exporter`, `Mode`, `ModeOption`, `RenderPhase`, `RenderPulseOptions`, `RenderPulse`, `RenderMonitorProps`.

Full reference: [Client API](https://amalmktk.github.io/react-render-pulse/api/client).

## Modes

|  | Lightweight | Profiling |
| --- | --- | --- |
| How it measures | Two marker components around each area time its render | React's `<Profiler>` reports each commit's render time |
| Needs | Any production build | React's profiling build |
| Sees updates that start inside an area | No: wrap the component that owns the state, or use `useRenderMonitor` in it | Yes |
| Cost | ~10 µs per measured render | About the same as a bare `<Profiler>`, which is the profiling build's own cost |
| Use for | Every production user | A sampled group or staging |

`mode: "auto"` (the default) starts in lightweight mode and switches to profiling mode when React's profiling build is detected. To enable the profiling build:

```ts
// vite.config.ts: `vite build --mode profiling`
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { alias: mode === "profiling" ? { "react-dom/client": "react-dom/profiling" } : {} },
}));
```

```bash
next build --profile   # Next.js
```

More: [Modes](https://amalmktk.github.io/react-render-pulse/guide/modes).

## Frameworks

**Vite / any SPA:** call `initRenderPulse` in your entry file before `createRoot(...).render(...)`.

**Next.js App Router:** use `instrumentation-client.ts` at the project root, which runs before hydration. `<RenderMonitor>` can be used directly in Server Components, because the package is marked `"use client"`.

```ts
// instrumentation-client.ts
import { initRenderPulse } from "react-render-pulse";

initRenderPulse({
  endpoint: "/api/render-pulse",
  getRoute: () => location.pathname.replace(/^\/orders\/[^/]+/, "/orders/[id]"),
});
```

**Next.js Pages Router:** call it at the top level of `pages/_app.tsx`, inside `if (typeof window !== "undefined")`.

**React Router:** report route patterns with `matchRoutes`:

```ts
getRoute: () => {
  const pattern = (matchRoutes(routes, router.state.location) ?? [])
    .map((m) => m.route.path ?? "")
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/");
  return pattern.startsWith("/") ? pattern : `/${pattern}`;
},
```

Full setups, with working example apps: [Frameworks](https://amalmktk.github.io/react-render-pulse/guide/frameworks) · [examples/](https://github.com/Amalmktk/react-render-pulse/tree/main/examples).

## What gets sent

One JSON object per batch (trimmed here):

```json
{
  "v": 1,
  "session": { "id": "5f0c9a1e-…", "seq": 1, "mode": "lightweight", "route": "/orders", "appVersion": "2.4.0" },
  "device": { "memoryGb": 4, "cores": 8, "connection": "4g", "viewport": "390x844" },
  "summary": { "renders": 42, "slowRenders": 5, "longTasks": 3, "longTaskMs": 400 },
  "areas": [
    { "id": "orders-table", "route": "/orders", "renders": 42, "slow": 5, "p50": 6.1, "p75": 11.8, "p95": 38.2, "max": 61.2, "hist": [] }
  ],
  "longTasks": [{ "area": "orders-table", "route": "/orders", "count": 3, "maxMs": 212 }]
}
```

- **Never collected:** user IDs, IP addresses, cookies, page text, input values, query strings.
- **The session id** is random per page load, held in memory only, and can't identify a user.
- **Routes** come from `location.pathname` via `getRoute`. The default only replaces numeric segments, so normalize UUIDs, usernames or slugs in `getRoute`.

Every field: [What we collect](https://amalmktk.github.io/react-render-pulse/guide/what-we-collect).

## Performance

Measured in Chromium with a benchmark that re-renders a whole app (8 monitored areas) per update, in paired A/B blocks:

| Mode | Added per measured render | Accuracy (known 2 / 8 / 20 ms components) |
| --- | --- | --- |
| Lightweight (production build) | 0.006–0.014 ms | 2.0 / 8.0 / 20.0 ms |
| Profiling (profiling build) | ~0.07–0.08 ms, the same as a bare `<Profiler>` | 2.0 / 8.0 / 20.1 ms |

The client is 3.6 kB brotli (`initRenderPulse` + `RenderMonitor` + `useRenderMonitor`). CI fails a pull request that exceeds the overhead or size budget. Method and reproduction: [Performance](https://amalmktk.github.io/react-render-pulse/guide/performance).

## Limitations

- Lightweight mode doesn't see updates that start below an area, such as a child's own state change. Monitor the component that owns the state, or use profiling mode for those sessions.
- `useRenderMonitor` durations are an upper bound. Use `<RenderMonitor>` around the component for its own render time.
- Long tasks are observed only where the browser supports them: Chromium for long tasks and long animation frames. Other browsers still report render timings.
- Profiling mode needs React's profiling build, which is slower than the regular build. Ship it to a sample, not everyone.

## What's next

Planned for v1.5 (no dates; plans can change):

- Slow interactions (INP) attributed to the component areas that caused them
- Release comparisons: which areas got faster or slower between two app versions
- Render budgets checked in pull requests, with a GitHub Action
- Regression alerts by webhook, and adaptive sampling (more data from slow devices)

Full list: [ROADMAP.md](https://github.com/Amalmktk/react-render-pulse/blob/main/ROADMAP.md). Ideas and feedback are welcome in [issues](https://github.com/Amalmktk/react-render-pulse/issues).

## Related packages

- [`react-render-pulse-collector`](https://www.npmjs.com/package/react-render-pulse-collector): validates and stores batches (Postgres, JSON file, custom)
- [`react-render-pulse-viewer`](https://www.npmjs.com/package/react-render-pulse-viewer): terminal report and web viewer

## License

MIT © Amal M
