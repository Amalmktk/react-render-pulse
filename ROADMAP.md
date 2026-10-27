# Roadmap

From the product plan. Versions up to 1.0 are built; publishing follows the release gates below.

## v0.1 — MVP

- [x] `<RenderMonitor>` in lightweight mode: render counts and durations per area
- [x] `useRenderMonitor`; nested areas
- [x] Aggregation: histograms, percentiles, worst cases, memory limits
- [x] Session sampling; route and viewport context; console output
- [x] Safe-failure tests (errors inside the package never reach the app)
- [x] Vite example

## v0.5 — Beta

- [x] Profiling mode with auto-detection of React's profiling build
- [x] Long tasks linked to monitored areas; device context (memory, cores, connection)
- [x] Delivery: batching, `sendBeacon` on page hide, `fetch` keepalive fallback, size limits
- [x] Example collector on Vercel; CLI viewer
- [x] Next.js examples (App Router and Pages Router)
- [ ] Run on a real site and publish findings

## v1.0 — Stable

- [x] App version in context; route-level grouping
- [x] Collector package: Zod validation, rate limiting, Postgres and JSON-file storage
- [x] Web viewer: slowest areas, worst devices, trends by day and app version
- [x] OpenTelemetry metrics export; React Router example
- [x] React version matrix in CI; overhead measured, budgeted and published per mode
- [x] Long animation frames where supported
- [ ] Publish 1.0.0 to npm

## v2.0 — Full

- [ ] Slow interactions (INP) attributed to component areas
- [ ] Release comparisons with confidence based on sample sizes
- [ ] Custom dimensions (feature flags, A/B variants)
- [ ] Adaptive sampling (more data from slow devices and rare routes)
- [ ] Regression alerts by webhook
- [ ] `react-render-pulse ci`: render budgets checked in pull requests, with a GitHub Action
- [ ] Self-hostable dashboard bundle
- [ ] Experimental React Native support
