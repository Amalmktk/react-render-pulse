# Architecture

This page explains how react-render-pulse works end to end: what runs in the browser, what crosses the network, what the collector stores, and how the viewer turns it into reports. To set it up, see [Collecting results](/guide/collecting-results).

## The big picture

Data moves in one direction. It's measured in the browser, summarized in memory, sent in small batches, stored by a collector you host, and read by the viewer.

```
 Browser (react-render-pulse)                     Your server                       You
 ┌────────────────────────────────────────┐      ┌───────────────────────────┐     ┌──────────────────────────┐
 │ <RenderMonitor> / useRenderMonitor     │      │ react-render-pulse-       │     │ react-render-pulse-viewer│
 │        │ render timings                │      │ collector                 │     │                          │
 │        ▼                               │      │                           │     │  report  (terminal)      │
 │ Aggregator: histograms, counts,        │ POST │  validate (Zod schema)    │     │  serve   (web viewer)    │
 │ worst cases, per area + route          │─────▶│  rate limit, size limit   │────▶│                          │
 │        ▲                               │batch │  origin check             │ DB  │  or: your own SQL,       │
 │ PerformanceObserver: long tasks,       │      │        │                  │     │  buildReport() in code   │
 │ long animation frames → blamed area    │      │        ▼                  │     └──────────────────────────┘
 │                                        │      │  Storage: Postgres,       │
 │ Exporters (optional): console, OTel    │      │  JSON Lines file, memory, │
 └────────────────────────────────────────┘      │  or your own              │
                                                 └───────────────────────────┘
```

Three packages, each usable on its own:

| Package | Runs in | Job |
| --- | --- | --- |
| `react-render-pulse` | The browser | Measure, aggregate in memory, send batches |
| `react-render-pulse-collector` | Your server or edge function | Validate and store batches |
| `react-render-pulse-viewer` | Your machine (Node 20+) | Turn stored batches into reports |

You can skip the collector and viewer: send batches to your own endpoint, or only use the OpenTelemetry exporter and your existing metrics backend.

## In the browser

### Startup and sampling

`initRenderPulse(options)` runs once, before the app renders. It:

1. **Decides sampling once per page load.** With `sampleRate: 0.05`, 5% of page loads are sampled. Unsampled sessions set up no observers, timers or listeners, and every monitor returns immediately.
2. **Picks a mode.** `"auto"` (the default) starts in lightweight mode and switches to profiling mode if React's profiling build is detected (see below).
3. **Creates a random session id** (`crypto.randomUUID()`), kept in memory only. It groups the batches of one page load; it's never stored on the device.
4. **Starts a `PerformanceObserver`** for long tasks and long animation frames, where the browser supports them.
5. **Registers flush triggers:** `visibilitychange` (page hidden), `pagehide`, and a timer every `flushIntervalMs` (3 minutes by default).

The runtime is stored on `globalThis`, so the ESM and CommonJS builds (or two bundled copies) share one. On the server, `initRenderPulse` does nothing and returns an inert object.

### Measuring a render

Each `<RenderMonitor id>` renders the same small tree in every mode:

```
<Profiler id onRender>      ← profiling mode reads actualDuration here
  <StartMarker />           ← lightweight mode: performance.now() when React renders it
  {children}
  <EndMarker />             ← lightweight mode: performance.now() again, after the children
</Profiler>
```

The markers render nothing and add no DOM. Because the tree never changes between modes or sampling decisions, switching modes or calling `initRenderPulse` late never remounts your components.

**Lightweight mode.** React renders siblings in order, so the time between the start marker and the end marker rendering brackets the children's render. The end marker's layout effect confirms the render committed (a render React throws away in concurrent mode is never recorded), then records the measurement in a microtask.

**Profiling mode.** React's `<Profiler>` reports `actualDuration` for every commit, including updates that start deep inside the area. React only calls `onRender` in development and in its profiling build.

**Auto-detection.** The first `<Profiler>` callback proves profiling timings are available, so `"auto"` switches to profiling mode. Lightweight measurements wait a microtask so that a commit measured both ways is counted once.

**`useRenderMonitor(id)`** records from the hook's call to the commit. Render counts are exact; the duration is an upper bound, because it includes anything React renders after the component in the same update. Hook timings are always labeled `mode: "lightweight"`.

| | Lightweight | Profiling |
| --- | --- | --- |
| Needs | Any build | React's profiling build |
| Sees updates that start inside the area | No | Yes |
| Cost (benchmark) | ~10 µs per measured render | about the cost of a bare `<Profiler>` in the profiling build |
| Use for | Every production user | A sampled group or staging |

### Attributing long tasks

The observer reports main-thread blocks of 50 ms or more (`longTaskMs`). The client keeps a ring of the last 200 render windows (area, start, end, duration). For each block it finds the renders that overlapped it and blames **the innermost area that accounts for at least half of the longest overlapping render**. So an inner area responsible for most of the time gets the blame, rather than the outermost wrapper or a tiny sibling. Blocks that overlap no render (event handlers, timers) are reported with `area: null`.

### Aggregating in memory

Raw events are never kept. Each measurement updates the summary for its **area + route** pair:

- counts: renders, mounts, slow renders (over `slowRenderMs`, 16 ms by default)
- total, min and max duration
- a 16-bucket histogram, with upper bounds of 1, 2, 4, 8, 12, 16, 24, 33, 50, 75, 100, 150, 250, 500 and 1000 ms, plus an overflow bucket
- the 5 slowest renders (`worstCases`), with phase and time since session start

Long tasks and long animation frames are summed per area + route. At most 200 area + route pairs are kept per batch (`maxAreas`); renders for new pairs beyond that are counted in `dropped.areas`. Memory stays flat however long the session runs.

The route comes from `getRoute()`, re-read only when the URL changes. The default replaces numeric path segments with `:id`, so `/orders/42` and `/orders/7` group together.

### Sending a batch

On each flush, if anything was measured, the client builds a payload (format below), then:

1. **Calls exporters.** The console exporter (on by default when there's no `endpoint`) logs a table; the OpenTelemetry exporter records metrics as measurements happen.
2. **Fits it to the size limit** (`maxPayloadBytes`, 60,000 by default, under the 64 KB `sendBeacon` limit): first drops worst-case lists, then the least-rendered areas.
3. **Sends it.** When the page is being hidden, it uses `navigator.sendBeacon`, which survives the page closing; otherwise, or if the beacon is refused, it uses `fetch` with `keepalive`. The body is sent as `text/plain`, so a collector on another origin needs no CORS preflight.
4. **Retries** on `429`, `5xx` or a network error: up to 3 attempts per batch, at most 5 batches queued, retried on the next flush. `4xx` responses are not retried, since the collector rejected the data.

### Never breaking the app

Every call into render-pulse from React, from observers, from timers and into your exporters and `getRoute` is wrapped so errors are swallowed (and logged with `debug: true`). Missing browser APIs (`PerformanceObserver`, `sendBeacon`, `fetch`, `crypto.randomUUID`) are detected, and the client degrades instead of failing. The test suite covers each of these cases.

## On the wire: the payload

One JSON object per batch, payload version 1. Durations are in milliseconds.

```json
{
  "v": 1,
  "session": {
    "id": "5f0c9a1e-2b7d-4f7e-9d1a-0e6f2c3b4a5d",
    "seq": 2,
    "mode": "lightweight",
    "route": "/orders",
    "appVersion": "2.4.0",
    "startedAt": 1761530000000,
    "sentAt": 1761530180000
  },
  "device": { "memoryGb": 4, "cores": 8, "connection": "4g", "viewport": "390x844" },
  "summary": { "renders": 42, "slowRenders": 5, "longTasks": 3, "longTaskMs": 400, "longFrames": 1, "longFrameMs": 212 },
  "areas": [
    {
      "id": "orders-table",
      "route": "/orders",
      "renders": 42,
      "mounts": 1,
      "slow": 5,
      "totalMs": 391.6,
      "min": 1.4,
      "max": 61.2,
      "p50": 6.1,
      "p75": 11.8,
      "p95": 38.2,
      "hist": [0, 2, 5, 10, 8, 12, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0],
      "worst": [{ "ms": 61.2, "phase": "update", "at": 5400 }]
    }
  ],
  "longTasks": [{ "area": "orders-table", "route": "/orders", "count": 3, "totalMs": 400, "maxMs": 212 }],
  "longFrames": [{ "area": "orders-table", "route": "/orders", "count": 1, "totalMs": 212, "maxMs": 212 }],
  "dropped": { "areas": 0 }
}
```

Why histograms: percentiles from different batches can't be averaged, but histograms can be added. The viewer merges `hist` arrays across batches, sessions, devices or releases and computes percentiles from the merged result, bounded by the observed `min` and `max`. Every field is explained in [What we collect](/guide/what-we-collect).

## On your server: the collector

`createCollector(options)` returns a standard `(request: Request) => Promise<Response>` handler, so it runs on Vercel, Netlify, Cloudflare Workers, Deno, Bun and Node 18+ (`toNodeListener` adapts it to Express and `node:http`). Each request goes through these checks in order:

| Step | Rejects with |
| --- | --- |
| `OPTIONS` → CORS preflight answer | `204` |
| Method must be `POST` | `405` |
| `Origin` must be in `allowedOrigins` (if it's a list) | `403` |
| Rate limit per client (120 per minute by default, in memory) | `429` + `Retry-After` |
| Body size, by header and while reading (64 KB by default) | `413` |
| Valid JSON | `400` |
| Strict schema: every field typed and bounded, unknown fields rejected | `400` with the issues |
| `storage.write(...)` | `500` if it throws |
| Stored | `204` |

The rate-limit key (the client IP from proxy headers or the socket) is held in memory for the window and never stored.

### Storage

A storage adapter has two methods: `write(batch)` and `read(query)`. A stored batch is `{ receivedAt, payload }`.

**Postgres** (`react-render-pulse-collector/postgres`) creates this table on first use:

```sql
CREATE TABLE IF NOT EXISTS render_pulse_batches (
  id          BIGSERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id  TEXT NOT NULL,
  app_version TEXT,
  route       TEXT NOT NULL,
  mode        TEXT NOT NULL,
  payload     JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS render_pulse_batches_received_at_idx ON render_pulse_batches (received_at DESC);
CREATE INDEX IF NOT EXISTS render_pulse_batches_app_version_idx ON render_pulse_batches (app_version, received_at DESC);
```

One row per batch. The whole payload is kept as `jsonb`, so you can query any field with SQL (examples in [Collecting results](/guide/collecting-results#_6-query-postgres-directly)).

**JSON Lines file** (`react-render-pulse-collector/json-file`) appends one stored batch per line. Good for local use and single servers with a disk; the viewer reads the file directly.

**Memory** keeps batches in the process, for tests and demos. **Custom storage:** implement `write` and `read` for any database (see [Collector and storage](/guide/collector#custom-storage)).

## On your machine: the viewer

The viewer reads stored batches (`--db` for Postgres, a file path for JSON Lines or JSON exports) and builds one report:

- **Totals:** sessions, renders, slow-render rate, p50/p75/p95, long tasks per session.
- **Areas** (by area + route) and **routes**, slowest p75 first.
- **Device classes** (memory · cores) and **connection types**, slowest first.
- **By day** and **by app version**, oldest first, for trends and release comparisons.

`report` prints these as terminal tables. `serve` starts a local server on `127.0.0.1:4173` with a web viewer and a JSON API (`GET /api/report?since=30d&version=2.4.0`). Both only read. `buildReport()` is exported if you want the same numbers in your own code.

## Deployment shapes

Pick the one that matches your app:

```
A. Same app, same origin (simplest)
   Next.js / Remix / Express app ──► /api/render-pulse route in the same app ──► Postgres
   No CORS. Collector code lives next to your app.

B. Standalone collector
   Any frontend(s) ──► https://collector.example.com/api/render-pulse (Vercel, Netlify, Cloudflare) ──► Postgres
   Set allowedOrigins to your sites. One collector for several apps.

C. Local / single server
   App ──► Node collector with jsonFileStorage ──► ./data/render-pulse.jsonl ──► viewer reads the file

D. Your existing metrics stack
   initRenderPulse({ exporters: [createOtelExporter({ meter })] }) ──► your OpenTelemetry pipeline
   No collector at all (no endpoint), or both at once.
```

## Privacy and limits by design

- **Never collected:** user IDs, IP addresses, cookies, page text, input values, query strings. The route is `location.pathname` through `getRoute`. The default replaces numbers only, so normalize UUIDs, usernames or slugs yourself.
- **Bounded everywhere:** ids are capped at 200 characters, routes at 500, 1000 areas per batch, 64 KB per request. The client clamps its own options to the collector's limits, so a generous setting can't get every batch rejected.
- **The collector only stores what the schema allows.** Unknown fields, including anything you add by mistake, are rejected rather than stored.

## Where to go next

- [Collecting results](/guide/collecting-results): deploy a collector, check data arrives, read and query it
- [Modes](/guide/modes): enabling the profiling build in Vite and Next.js
- [Choosing areas](/guide/choosing-areas): where monitors give useful results
- [Performance](/guide/performance): measured overhead and accuracy
- [Decision 001](/decisions/001-modes): why the modes work the way they do
