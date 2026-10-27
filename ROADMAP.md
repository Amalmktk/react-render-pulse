# Roadmap

## v1.0 — current

- [x] `<RenderMonitor>` and `useRenderMonitor`; nested areas
- [x] Lightweight mode (any build) and profiling mode, with auto-detection of React's profiling build
- [x] Aggregation: histograms, percentiles, worst cases, memory limits; route-level grouping
- [x] Session sampling; route, viewport, device, connection and app-version context
- [x] Long tasks and long animation frames linked to monitored areas
- [x] Delivery: batching, `sendBeacon` on page hide, `fetch` keepalive fallback, retries, size limits
- [x] Safe failure: errors inside the package never reach the app
- [x] Collector package: Zod validation, rate limiting, origin checks; Postgres, JSON-file and in-memory storage
- [x] Viewer: CLI report and web viewer (slowest areas, worst devices, trends by day and app version)
- [x] OpenTelemetry metrics export
- [x] Examples: Vite, Next.js App Router and Pages Router, React Router, a Vercel collector
- [x] React version matrix in CI; overhead measured, budgeted and published per mode
- [ ] Publish 1.0.0 to npm
- [ ] Run on a real site and publish findings

## v1.5 — next

- [ ] Slow interactions (INP) attributed to component areas
- [ ] Release comparisons with confidence based on sample sizes
- [ ] Custom dimensions (feature flags, A/B variants)
- [ ] Adaptive sampling (more data from slow devices and rare routes)
- [ ] Regression alerts by webhook
- [ ] `react-render-pulse ci`: render budgets checked in pull requests, with a GitHub Action
- [ ] Self-hostable dashboard bundle
- [ ] Experimental React Native support
