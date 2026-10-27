# react-render-pulse

The browser client. React 18 or 19 is a peer dependency.

| Entry                     | Exports                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-render-pulse`      | `initRenderPulse`, `RenderMonitor`, `useRenderMonitor`, `createConsoleExporter`, `HISTOGRAM_BOUNDS`, `histogramPercentile`, and all types. Marked `"use client"`. |
| `react-render-pulse/core` | `HISTOGRAM_BOUNDS`, `histogramPercentile`, and all payload and event types. No React imports, safe in Server Components, route handlers and Node.                 |
| `react-render-pulse/otel` | `createOtelExporter` and its types.                                                                                                                               |

## `initRenderPulse(options)`

```ts
function initRenderPulse(options?: RenderPulseOptions): RenderPulse;
```

Starts measuring. Call it once, in the browser, before your app renders. Calling it again replaces the previous setup. On the server (no `window`) it does nothing and returns an inert object with `sampled: false`.

### Options

| Option            | Type                                     | Default                                         | Description                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoint`        | `string`                                 | none                                            | Where batches are `POST`ed. Without one, batches only go to `exporters` (and the console, see `debug`).                                                                                                        |
| `sampleRate`      | `number`                                 | `1`                                             | Fraction of sessions that collect anything, 0 to 1, decided once at startup.                                                                                                                                   |
| `mode`            | `"profiling" \| "lightweight" \| "auto"` | `"auto"`                                        | How renders are measured. `"auto"` is lightweight until React's profiling build is detected. See [Modes](/guide/modes).                                                                                        |
| `slowRenderMs`    | `number`                                 | `16`                                            | Renders slower than this are counted as slow (one frame at 60 Hz).                                                                                                                                             |
| `longTaskMs`      | `number`                                 | `50`                                            | Long tasks and long animation frames shorter than this are ignored.                                                                                                                                            |
| `appVersion`      | `string`                                 | none                                            | Your app's version, for comparing releases, e.g. `import.meta.env.VITE_APP_VERSION`. Truncated to 100 characters. Sent as `null` when unset.                                                                   |
| `getRoute`        | `() => string`                           | path with numeric segments replaced by `:id`    | Returns the current route, ideally a template like `/orders/:id`. Called only when `location.href` changes. Truncated to 500 characters. See [Route grouping](/guide/choosing-areas#route-grouping).           |
| `flushIntervalMs` | `number`                                 | `180000`                                        | Also sends a batch this often while the page is visible. `0` sends only when the page is hidden.                                                                                                               |
| `maxPayloadBytes` | `number`                                 | `60000`                                         | Largest batch in bytes, under the 64 KB `sendBeacon` limit. Clamped to 1000–65536 (the collector's default limit). Bigger batches are trimmed: worst-case lists first, then the areas with the fewest renders. |
| `maxAreas`        | `number`                                 | `200`                                           | Most area/route pairs per batch, clamped to 1–1000. Renders for new pairs past this are dropped and counted in `dropped.areas`.                                                                                |
| `worstCases`      | `number`                                 | `5`                                             | Slowest renders kept per area per batch, clamped to 0–50.                                                                                                                                                      |
| `exporters`       | `Exporter[]`                             | `[]`                                            | Receive measurements and batches, e.g. `createOtelExporter`.                                                                                                                                                   |
| `debug`           | `boolean`                                | `true` when there's no `endpoint`, else `false` | Logs each batch to the console with `createConsoleExporter` and reports internal errors as console warnings.                                                                                                   |

Batches are sent when the page becomes hidden (`visibilitychange`, plus `pagehide` for older Safari), every `flushIntervalMs` while visible, and on `flush()`. When the page is unloading, `navigator.sendBeacon` is used, falling back to `fetch` with `keepalive`. Failed sends are retried on later flushes for `429`, `5xx` and network errors, up to 3 attempts per batch and at most 5 queued batches.

### Return value: `RenderPulse`

| Member      | Type                           | Description                                                                                                                                                                   |
| ----------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sampled`   | `boolean`                      | `false` when this session was left out by `sampleRate`; nothing is measured or sent.                                                                                          |
| `mode`      | `"profiling" \| "lightweight"` | The current measurement mode. In `"auto"`, this changes to `"profiling"` once the profiling build is detected.                                                                |
| `flush()`   | `() => Payload \| null`        | Builds a batch from everything measured since the last one and sends it. Returns it, or `null` when there was nothing to send.                                                |
| `destroy()` | `() => void`                   | Stops observing and sending, and detaches `<RenderMonitor>`s, which keep rendering their children as usual. Doesn't send a final batch; call `flush()` first if you need one. |

## `<RenderMonitor>`

```tsx
<RenderMonitor id="orders-table">
  <OrdersTable />
</RenderMonitor>;
```

Measures the renders of its children and reports them under `id`.

| Prop       | Type        | Description                                                                                                                                                                               |
| ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | `string`    | Names this area in reports, e.g. `"orders-table"`. Areas with the same id on the same route are reported together. Truncated to 200 characters; an empty id is reported as `"(unnamed)"`. |
| `children` | `ReactNode` | The subtree to measure.                                                                                                                                                                   |

It renders a `<Profiler>` around its children and two empty marker components, the same tree in every mode and whether or not the session is sampled, so switching modes or calling `initRenderPulse` late never remounts children. It adds no DOM elements.

- Profiling mode: records React's `actualDuration` for every commit inside it.
- Lightweight mode: records the time between the markers rendering. Updates that start below the area aren't seen. See [Modes](/guide/modes#what-lightweight-mode-can-t-see).

Only committed renders are recorded, and StrictMode's repeated effects aren't counted twice.

## `useRenderMonitor(id)`

```ts
function useRenderMonitor(id: string): void;
```

Tracks the renders of the component that calls it, reported under `id`. Render counts are exact. The duration runs from the hook's call to the commit, so it also includes anything React renders after this component in the same update: an upper bound. Wrap the component in `<RenderMonitor>` when you need its own render time. Uses timing marks in every mode, so its measurements are labeled `mode: "lightweight"` even in a profiling session.

## `createConsoleExporter()`

```ts
function createConsoleExporter(): Exporter;
```

Logs each batch as a collapsed console group with a table of areas, slowest p75 first, and tables of long tasks and long frames. Used automatically when `debug` is on.

## `createOtelExporter(options)`

```ts
import { createOtelExporter } from "react-render-pulse/otel";

function createOtelExporter(options: OtelExporterOptions): Exporter;
```

| Option         | Type            | Default  | Description                                                         |
| -------------- | --------------- | -------- | ------------------------------------------------------------------- |
| `meter`        | `OtelMeterLike` | required | e.g. `metrics.getMeter("my-app")` from `@opentelemetry/api`.        |
| `slowRenderMs` | `number`        | `16`     | Renders slower than this also increment `render_pulse.render.slow`. |

`OtelMeterLike` is the subset of an OpenTelemetry `Meter` used: `createHistogram(name, options?)` returning `{ record(value, attributes?) }`, and `createCounter(name, options?)` returning `{ add(value, attributes?) }`. Metric names and attributes are listed in the [OpenTelemetry guide](/guide/opentelemetry#metrics).

## `HISTOGRAM_BOUNDS`

```ts
const HISTOGRAM_BOUNDS: readonly [1, 2, 4, 8, 12, 16, 24, 33, 50, 75, 100, 150, 250, 500, 1000];
```

Upper bounds in milliseconds (inclusive) of the render-duration histogram buckets, plus an implicit overflow bucket, so `hist` arrays have 16 entries. Part of payload version 1.

## `histogramPercentile(hist, p, max, min?)`

```ts
function histogramPercentile(hist: readonly number[], p: number, max: number, min?: number): number;
```

Estimates percentile `p` (0 to 100) from bucket counts, interpolating linearly inside the bucket. The observed `max` and `min` (default 0) narrow the bucket's range, so the estimate stays between them; `max` also bounds the overflow bucket. Returns 0 for an empty histogram. Rounded to 0.1 ms. Use it on histograms summed across batches.

## Types

| Type                                                                            | Description                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RenderPulseOptions`                                                            | Options for `initRenderPulse`.                                                                                                                                                                                                                                                                   |
| `RenderPulse`                                                                   | Return value of `initRenderPulse`.                                                                                                                                                                                                                                                               |
| `RenderMonitorProps`                                                            | `{ id: string; children?: ReactNode }`.                                                                                                                                                                                                                                                          |
| `Mode`                                                                          | `"profiling" \| "lightweight"`.                                                                                                                                                                                                                                                                  |
| `ModeOption`                                                                    | `Mode \| "auto"`.                                                                                                                                                                                                                                                                                |
| `RenderPhase`                                                                   | `"mount" \| "update" \| "nested-update"`, as React's `<Profiler>` reports.                                                                                                                                                                                                                       |
| `RenderEvent`                                                                   | One measured commit of one area: `area`, `route`, `phase`, `duration`, `startTime`, `endTime` (on the `performance.now()` timeline, ms), and `mode`: how it was measured, `"profiling"` for `<Profiler>` timings and `"lightweight"` for marks (including every `useRenderMonitor` measurement). |
| `LongTaskKind`                                                                  | `"longtask" \| "long-animation-frame"`.                                                                                                                                                                                                                                                          |
| `LongTaskEvent`                                                                 | One main-thread block: `kind`, `area`, `route`, `startTime`, `duration`.`area` is the innermost overlapping monitored area that accounts for at least half of the longest overlapping render, or `null` when none overlapped.                                                                    |
| `Exporter`                                                                      | `{ onRender?(event: RenderEvent); onLongTask?(event: LongTaskEvent); onFlush?(payload: Payload) }`. Errors thrown in these are caught.                                                                                                                                                           |
| `Payload`                                                                       | The batch sent to the collector.                                                                                                                                                                                                                                                                 |
| `SessionInfo`, `DeviceContext`, `SessionSummary`, `WorstCase`, `LongTaskReport` | Parts of `Payload`.                                                                                                                                                                                                                                                                              |
| `AreaReport`                                                                    | One area on one route in a batch: `id`, `route`, `renders`, `mounts`, `slow`, `totalMs`, `min`, `max`, `p50`, `p75`, `p95`, `hist`, `worst`.                                                                                                                                                     |

Every field of `Payload` and its parts is described in [What we collect](/guide/what-we-collect#fields).
