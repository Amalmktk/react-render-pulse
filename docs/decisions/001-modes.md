# 001: Measurement modes and the overhead budget

Status: accepted, October 2026.

## Context

react-render-pulse has to measure component render time on real users' devices with overhead small enough to leave on in production. React offers one public API for render timing, `<Profiler>`, and it only reports timings in development and in React's profiling build. Most production apps ship the regular build.

The questions this decision answers:

1. How do we measure in the regular production build?
2. How do we use the profiling build when an app has it, without asking the developer to configure it?
3. What does each approach cost, and what overhead do we accept?

## Decision

### Two modes, chosen automatically

- **Lightweight mode** (any build). `<RenderMonitor>` renders two empty marker components around its children. The first marker reads `performance.now()` when React renders it, and the last reads it again once React has rendered everything in between. A layout effect then confirms that the render committed, so a render React discards in concurrent mode isn't recorded. The measurement is recorded in a microtask after the commit.
- **Profiling mode** (profiling build). `<RenderMonitor>` also wraps its children in `<Profiler>` and records `actualDuration`.
- **Auto** (the default) starts in lightweight mode and switches to profiling mode the first time a `<Profiler>` callback fires. React only calls it in builds that support it, so this is a reliable signal that uses no React internals. Lightweight measurements of the same commit are dropped (that's why they wait for a microtask) so a commit is never counted twice.

`<RenderMonitor>` renders the same tree in every mode and whether or not the session is sampled. Switching modes, or calling `initRenderPulse` after the first render, never remounts the app.

### What lightweight mode can't see

The markers only render when `<RenderMonitor>` renders. An update that starts below the monitor, such as a child's own state change, doesn't render the markers, so lightweight mode doesn't see it. Profiling mode does. The [Next.js App Router example](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/next-app-router) shows this: the orders table keeps its filter state inside, so lightweight mode records its mount but not its updates. The docs recommend wrapping the component that owns the state, or using `useRenderMonitor` inside it, which counts every render.

`useRenderMonitor` measures from its own render to the commit, so its duration is an upper bound that can include other components rendered later in the same update. Its timings are always labeled `mode: "lightweight"`.

### Overhead budget

Measured with the benchmark in `bench/` (method below):

|                           | Lightweight                    | Profiling                       | Bare `<Profiler>` |
| ------------------------- | ------------------------------ | ------------------------------- | ----------------- |
| Added per update          | +0.08 to +0.12 ms (+7 to +11%) | +0.53 to +0.93 ms (+33 to +50%) | +0.49 to +0.58 ms |
| Added per measured render | 0.011–0.014 ms                 | 0.067–0.117 ms                  | 0.062 ms          |

Ranges cover the repeated runs during this decision. The budget enforced in CI (`bench/budget.json`):

| Mode        | Max added per update | Max added per measured render |
| ----------- | -------------------- | ----------------------------- |
| Lightweight | 15%                  | 0.03 ms                       |
| Profiling   | 75%                  | 0.15 ms                       |

The client bundle budget is 3.75 kB brotli for `initRenderPulse` + `<RenderMonitor>` + `useRenderMonitor` (3.57 kB at this decision), and 600 B for the OpenTelemetry exporter.

### Consequences

- **Lightweight mode is safe for every production user.** It adds about 10–15 µs per measured render.
- **Profiling mode is for a sampled group or staging.** Almost all of its cost is React's profiling instrumentation: a bare `<Profiler>` with an empty callback costs within noise of render-pulse's full profiling mode. render-pulse can't make the profiling build cheaper, so the docs say to ship it to a small sample (e.g. a separate profiling deploy behind a flag).
- **Enabling the profiling build:** in Vite, alias `react-dom/client` to `react-dom/profiling` (see `examples/vite-react`, `vite build --mode profiling`). In Next.js, use `next build --profile`. Both examples build and pass the browser tests in profiling mode.

## How the numbers were measured

The first approach compared separate builds in separate page loads under 4× CPU throttling. It reported lightweight mode at +33%. That turned out to be noise: the same build varied from 3.9 to 15.9 ms per update across page loads, and a structure-only variant came out slower than the full one. The method that holds up:

1. **One page, two trees.** The app switches at runtime between the monitored tree and the identical tree without render-pulse, so both arms share the same JIT state, page and machine conditions.
2. **Paired, alternating blocks.** The arms alternate in blocks of 60 updates (A B, B A, …). Each block's mean is paired with the neighboring block of the other arm, and the reported overhead is the median paired difference.
3. **Block timing.** `performance.now()` is coarsened to 0.1 ms in pages without cross-origin isolation, too coarse to time ~1 ms updates one at a time, so each block is timed as a whole.
4. **Deferred work counted.** Each update drains microtasks before the clock stops, since lightweight mode records in a microtask.
5. **No CPU throttling by default.** On the development machine, Chrome's throttling made the baseline itself swing from 6 to 11 ms per update between identical runs. Unthrottled, repeated runs agreed within about 0.03 ms. `--cpu 4` remains available.

The accuracy check also changed the payload. Components with a known cost of exactly 8 ms were first reported as about 6.5 ms. Every value sat at the top edge of the (4, 8] histogram bucket, and percentiles were interpolated from the bucket's lower bound. Payload v1 now includes each area's `min`, and percentile estimates are bounded by the observed min and max. Known costs of 2, 8 and 20 ms now report as 2.0, 8.0 and 20.1 ms in both modes.

## Alternatives considered

- **Detecting the profiling build from React internals** (e.g. the DevTools hook's renderer metadata). Rejected: it's not a public API, and the plan's risk table calls for public APIs only.
- **Measuring with `performance.mark`/`measure` entries.** Each mark adds an entry to the browser's performance timeline and costs more than reading `performance.now()`. Lightweight mode keeps timings in memory instead.
- **Removing the marker components in profiling mode.** That would change the tree between modes and remount the app when auto mode switches. Their cost is within the noise above.
