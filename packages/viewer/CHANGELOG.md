# react-render-pulse-viewer

## 1.1.0

### Minor Changes

- 587aa22: Separate timings for first renders and updates. Each area in a batch now carries an optional `phases` object with `mount` and `update` timings (renders, slow count, min, max, p50/p75/p95 and a histogram for each), so a slow first render no longer hides slow updates. The area's own fields still cover both phases, so nothing that reads them changes.
  
  The viewer's terminal report gains a "First renders vs updates" table, and `AreaSummary` gains optional `mount` and `update` timings.
  
  **Upgrade the collector before the client.** The collector now accepts `phases`; a 1.0 collector rejects batches that contain it. See "Upgrading to 1.1" in the collector guide.

### Patch Changes

- Updated dependencies [587aa22]
  - react-render-pulse@1.1.0
  - react-render-pulse-collector@1.1.0

## 1.0.1

### Patch Changes

- c490b0e: Complete READMEs on npm: how it works, every option, collecting and querying results (including SQL), framework setup, deployment targets, and links to the documentation site at https://amalmktk.github.io/react-render-pulse/. No code changes.
- Updated dependencies [c490b0e]
  - react-render-pulse@1.0.1
  - react-render-pulse-collector@1.0.1

## 1.0.0

### Major Changes

- First stable release (1.0.0).
  
  - **react-render-pulse:** `initRenderPulse`, `<RenderMonitor>`, and `useRenderMonitor`; lightweight and profiling modes with auto-detection of React's profiling build; long tasks and long animation frames attributed to areas; per-area histograms (p50/p75/p95), worst cases, and session summaries grouped by route; route, app version, and device context; batching with `sendBeacon` on page hide, `fetch` keepalive fallback, retries, and size limits; OpenTelemetry export (`react-render-pulse/otel`); a React-free `react-render-pulse/core` entry.
  - **react-render-pulse-collector:** a standard Request → Response handler with Zod validation, rate limiting, and CORS; Postgres, JSON-file, and in-memory storage; a Node adapter (`react-render-pulse-collector/node`).
  - **react-render-pulse-viewer:** `report` (terminal tables from a file or Postgres) and `serve` (web viewer: slowest areas, worst devices, trends by day and app version).

### Patch Changes

- Updated dependencies
  - react-render-pulse@1.0.0
  - react-render-pulse-collector@1.0.0
