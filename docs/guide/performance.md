# Performance

A performance monitor must not make the app noticeably slower. This page shows what react-render-pulse costs and how to measure it yourself.

## What the client does at runtime

- **Unsampled sessions** decide once at startup and then do almost nothing: monitors render their markers and return early, and no observers, timers or listeners are set up.
- **Lightweight mode** reads `performance.now()` twice per monitored render and records the result in a microtask after the commit.
- **Profiling mode** relies on React's profiling build, which is slower than the regular build. That cost comes from React, not this package, which is why it's best kept to a sampled group.
- **Aggregation** keeps counts, a 16-bucket histogram and the 5 slowest renders per area. Raw events are never stored, so memory stays flat however long the session runs.
- **Sending** happens every 3 minutes while the page is visible and when it's hidden, with `sendBeacon` or `fetch` with `keepalive`. Nothing is sent when nothing was measured.

## Overhead benchmarks

The benchmark app in `bench/` renders a large table (800 memoized rows), a chart, a 30-field form, and components with known render cost. Each update re-renders the whole app synchronously; 7 `<RenderMonitor>`s and 1 `useRenderMonitor` measure it.

### Results

Chromium 156, no CPU throttling, Windows laptop, October 2026. 3 pages × 30 paired blocks × 60 updates per mode:

| Mode                                                        | Update without render-pulse | Added per update (median) | Added, middle 50% of pairs | Added per measured render |
| ----------------------------------------------------------- | --------------------------- | ------------------------- | -------------------------- | ------------------------- |
| Lightweight (production build)                              | 1.08 ms                     | +0.115 ms (+10.6%)        | −0.125 to 0.302 ms         | 0.014 ms                  |
| Profiling (profiling build)                                 | 1.21 ms                     | +0.534 ms (+44.2%)        | 0.300 to 0.790 ms          | 0.067 ms                  |
| For comparison: a bare React `<Profiler>` (profiling build) | 1.23 ms                     | +0.492 ms (+40.0%)        | 0.225 to 0.811 ms          | 0.062 ms                  |

Two earlier runs of lightweight mode measured +7.1% and +7.4% (0.011–0.012 ms per measured render).

What this means:

- **Lightweight mode costs about 10–15 µs per measured render.** Even this benchmark, where every update re-renders eight monitored areas that do little else, adds about a tenth of a millisecond per update. In a real app, where components do more work, the share is smaller.
- **Profiling mode's cost is React's, not render-pulse's.** Wrapping the same areas in a bare `<Profiler>` with an empty callback costs nearly as much (+0.49 ms against +0.53 ms). React's profiling build times every render and effect inside a Profiler. That's why profiling mode is meant for a sampled group or staging.

### Accuracy

The same run checks that render-pulse reports components with known render cost (2, 8 and 20 ms of busy work) correctly, in both modes:

| Mode        | 2 ms component | 8 ms component | 20 ms component | Ranked correctly |
| ----------- | -------------- | -------------- | --------------- | ---------------- |
| Lightweight | 2.0 ms         | 8.0 ms         | 20.1 ms         | Yes              |
| Profiling   | 2.0 ms         | 8.0 ms         | 20.1 ms         | Yes              |

These are p50 values estimated from the histograms sent in the payload, the same way the viewer computes them.

### How it's measured

- **Inside one page, A/B.** The app switches between the monitored tree and the identical tree without render-pulse, in alternating blocks (A B, B A, …). Comparing separate page loads doesn't work: the same build varied from 3.9 to 15.9 ms per update across page loads, far more than the effect.
- **Paired blocks.** Each block of 60 updates is timed as a whole, since browsers coarsen `performance.now()` to 0.1 ms, and paired with the neighboring block of the other arm. The overhead is the median of the paired differences; the middle 50% shows the noise.
- **Deferred work included.** Each update drains microtasks before the clock stops, so the work lightweight mode does after the commit is counted.
- **Not throttled by default.** With Chrome's CPU throttling, the baseline on the same machine swung from 6 to 11 ms per update between identical runs, wider than the effect. On a quiet machine, `node run.mjs --cpu 4` shows slow-device numbers.

### Budget

CI fails a pull request when the benchmark exceeds `bench/budget.json` or the accuracy check fails:

| Mode        | Max added per update | Max added per measured render |
| ----------- | -------------------- | ----------------------------- |
| Lightweight | 15%                  | 0.03 ms                       |
| Profiling   | 75%                  | 0.15 ms                       |

The limits leave room for CI-runner noise above the measured values. See [decision 001](/decisions/001-modes) for how they were set.

### Reproduce

From the repository root:

```bash
pnpm install
pnpm build
pnpm bench
```

`pnpm bench` builds the benchmark app twice (React's production build with lightweight mode, and its profiling build with profiling mode), runs both in Chromium with Playwright, prints the tables above and writes `bench/results/latest.json`. Add `-- --check` to exit with an error when the budget is exceeded. You need Chromium for Playwright: `pnpm --filter react-render-pulse-bench exec playwright install chromium`.

Numbers vary with hardware, so compare modes within one run rather than with numbers from another machine.

## Bundle size

The client's size budget is enforced with [size-limit](https://github.com/ai/size-limit), measured brotli-compressed with React excluded:

| Import                                                                           | Budget  |
| -------------------------------------------------------------------------------- | ------- |
| `{ initRenderPulse, RenderMonitor, useRenderMonitor }` from `react-render-pulse` | 3.75 kB |
| `{ createOtelExporter }` from `react-render-pulse/otel`                          | 600 B   |

To check the current size:

```bash
pnpm build
pnpm size
```

The package has `"sideEffects": false`, so bundlers drop exports you don't import. `react-render-pulse/core` contains only types, `HISTOGRAM_BOUNDS` and `histogramPercentile`.

## Keeping overhead low in your app

- Use `sampleRate` in production. A few percent of sessions is usually enough for stable percentiles on busy pages.
- Keep areas coarse: a monitor per meaningful section, not per component or per list row. See [Choosing areas](/guide/choosing-areas).
- Use the profiling build only for a sampled group or staging, unless you've measured its cost on your app.
