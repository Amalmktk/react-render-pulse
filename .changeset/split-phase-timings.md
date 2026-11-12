---
"react-render-pulse": minor
"react-render-pulse-collector": minor
"react-render-pulse-viewer": minor
---

Separate timings for first renders and updates. Each area in a batch now carries an optional `phases` object with `mount` and `update` timings (renders, slow count, min, max, p50/p75/p95 and a histogram for each), so a slow first render no longer hides slow updates. The area's own fields still cover both phases, so nothing that reads them changes.

The viewer's terminal report gains a "First renders vs updates" table, and `AreaSummary` gains optional `mount` and `update` timings.

**Upgrade the collector before the client.** The collector now accepts `phases`; a 1.0 collector rejects batches that contain it. See "Upgrading to 1.1" in the collector guide.
