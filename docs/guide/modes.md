# Modes

React only reports per-subtree render times through `<Profiler>`, and it only does that in development and in its profiling build. Most production apps ship the regular build, so react-render-pulse has two ways to measure.

|                                         | Profiling mode                                               | Lightweight mode                                                                       |
| --------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| How it measures                         | React's `<Profiler>` `actualDuration` for each commit        | The time between two marker components rendering, before and after the area's children |
| Requires                                | React's profiling build (or development)                     | Nothing                                                                                |
| Sees updates that start inside the area | Yes                                                          | No                                                                                     |
| Accuracy                                | Exact render time of the subtree                             | Approximate, area level                                                                |
| Overhead                                | Higher, almost all of it from React's profiling build itself | About 10–15 µs per measured render                                                     |
| Best for                                | A sampled group of users, or staging                         | All production users                                                                   |

The overhead figures come from the benchmark on the [Performance](/guide/performance) page. [Decision 001](/decisions/001-modes) records how the two modes were chosen and measured.

Choose with the `mode` option:

```ts
initRenderPulse({ mode: "auto" }); // the default
initRenderPulse({ mode: "lightweight" });
initRenderPulse({ mode: "profiling" });
```

## How auto mode works

`"auto"` starts in lightweight mode. React calls a `<Profiler>`'s `onRender` only in development and in the profiling build, so the first `onRender` call from any `<RenderMonitor>` proves per-subtree timings are available, and auto mode switches to profiling mode for the rest of the page load. It doesn't read React internals, and there is no public API to ask which build is loaded.

The switch can happen on the very first commit. That commit is measured both ways, and the profiler measurement replaces the lightweight one, so nothing is counted twice.

`RenderPulse.mode` returns the current mode, and every batch records it in `session.mode`.

Each measurement also carries the way it was taken, in `RenderEvent.mode` (and the OpenTelemetry `render_pulse.mode` attribute): `"profiling"` for `<Profiler>` timings, `"lightweight"` for timing-mark measurements. `useRenderMonitor` always uses marks, so its measurements are labeled `"lightweight"` even in a profiling session.

::: tip Development builds
In development React always calls `onRender`, so auto mode reports profiling mode locally. Development renders are much slower than production ones, so treat local numbers as relative.
:::

`"profiling"` uses the profiler from the start. If the profiling build isn't loaded, `onRender` never fires and `<RenderMonitor>` records nothing, so only use it when you know the build is there. `"lightweight"` never uses the profiler, even when it's available.

## Enable the profiling build

The profiling build is `react-dom/profiling`. It has the same API as `react-dom/client`, so you swap one for the other at build time.

### Vite

Alias `react-dom/client` to `react-dom/profiling`. The [Vite example](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/vite-react) does this only for a separate build mode, so the regular build is unchanged:

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    // `vite build --mode profiling` uses React's profiling build.
    alias: mode === "profiling" ? { "react-dom/client": "react-dom/profiling" } : {},
  },
  build: { outDir: mode === "profiling" ? "dist-profiling" : "dist" },
}));
```

```bash
vite build                  # regular build, lightweight mode
vite build --mode profiling # profiling build, profiling mode
```

To ship the profiling build to only part of your traffic, deploy both outputs and route a share of users to `dist-profiling`. `mode: "auto"` then measures each build the right way with the same client code.

### Next.js

Build with the `--profile` flag:

```bash
next build --profile
```

This makes Next.js use React's profiling build in production. Leave `mode` as `"auto"`.

### Other bundlers

Any bundler that supports aliases works the same way: resolve the exact specifier `react-dom/client` to `react-dom/profiling`. Don't alias `react-dom` itself, or other `react-dom/*` imports break.

## What lightweight mode can't see

`<RenderMonitor>` renders a start marker, its children, then an end marker. In lightweight mode the duration is the time between the two markers rendering, so it covers the children's render work in that pass.

The markers only render when the `<RenderMonitor>` itself re-renders: on mount, and when a parent above it re-renders. **An update that starts below the area, such as a child's own `useState` change, doesn't re-render the markers, so lightweight mode doesn't see it.** Profiling mode does, because React's `<Profiler>` reports every commit inside it.

Practical consequences:

- An area whose children update themselves (a table that sorts on click, a form with local state) shows fewer renders in lightweight mode than really happened. The [Next.js App Router example](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/next-app-router) shows this: `orders-table` wraps `<OrdersTable>`, which holds the status filter's state, so `orders-table` doesn't see filter changes in lightweight mode. The `useRenderMonitor("status-filter")` call inside the filter component still records each change, because that component re-renders.
- To catch those updates in lightweight mode, put the monitor inside the component that owns the state, or use `useRenderMonitor` in it.
- Long tasks are still observed and attributed to areas that rendered around the same time, so a slow self-update that blocks the main thread still shows up in the long-task numbers.

In concurrent renders that yield to the browser (transitions, `useDeferredValue`), the time between the markers can include time the main thread spent on other work. Durations are approximate at area level.

## The hook's duration is an upper bound

`useRenderMonitor(id)` uses timing marks in every mode, so its measurements are labeled `"lightweight"` even in a profiling session. It notes the time when the hook is called and records a measurement when the component's layout effect runs, after the commit.

- The render count is exact. Mounts and updates are counted correctly, including updates that start in the component itself.
- The duration runs from the hook's call to the commit, so it includes everything React renders after this component in the same update, and the commit itself. It's an upper bound, not the component's own render time.

When you need a component's own render time, wrap it in `<RenderMonitor>` instead.

## Safety

In every mode, errors inside react-render-pulse, in exporters, and in `getRoute` are caught and never reach your app. With `debug` on, they're logged as console warnings. Monitors keep rendering their children if `initRenderPulse` is never called, is called late, or after `destroy()`.
