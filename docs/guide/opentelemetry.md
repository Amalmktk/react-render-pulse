# OpenTelemetry

If you already have an OpenTelemetry metrics pipeline, react-render-pulse can record every measurement as OpenTelemetry metrics, with or without its own collector.

The exporter lives in a separate entry, `react-render-pulse/otel`, so apps that don't use it don't ship it. It's under 600 bytes and has no dependency on `@opentelemetry/api`: it accepts any object shaped like a `Meter`.

## Setup

```ts
import { metrics } from "@opentelemetry/api";
import { initRenderPulse } from "react-render-pulse";
import { createOtelExporter } from "react-render-pulse/otel";

initRenderPulse({
  sampleRate: 0.1,
  exporters: [
    createOtelExporter({
      meter: metrics.getMeter("my-app"),
      slowRenderMs: 16,
    }),
  ],
  debug: false, // without an endpoint, debug defaults to true and logs batches to the console
});
```

Configure the browser `MeterProvider` and exporter (for example OTLP over HTTP) as you normally would; react-render-pulse only records values on the meter you pass.

To send to both your OpenTelemetry pipeline and a react-render-pulse collector, set `endpoint` as well.

## Options

| Option         | Type            | Default  | Description                                                                                                                         |
| -------------- | --------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `meter`        | `OtelMeterLike` | required | For example `metrics.getMeter("my-app")` from `@opentelemetry/api`.                                                                 |
| `slowRenderMs` | `number`        | `16`     | Renders slower than this also increment `render_pulse.render.slow`. Set it to the same value as `initRenderPulse`'s `slowRenderMs`. |

## Metrics

| Name                             | Instrument | Unit | Attributes                                                                           | Recorded                                                          |
| -------------------------------- | ---------- | ---- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `render_pulse.render.duration`   | Histogram  | `ms` | `render_pulse.area`, `render_pulse.route`, `render_pulse.phase`, `render_pulse.mode` | Every measured render                                             |
| `render_pulse.render.slow`       | Counter    |      | `render_pulse.area`, `render_pulse.route`, `render_pulse.phase`, `render_pulse.mode` | Every render slower than `slowRenderMs`                           |
| `render_pulse.longtask.duration` | Histogram  | `ms` | `render_pulse.area`, `render_pulse.route`, `render_pulse.kind`                       | Every long task and long animation frame at or above `longTaskMs` |

Attribute values:

| Attribute            | Values                                                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render_pulse.area`  | The monitor's `id`. On long tasks, the area that was rendering, or `"(none)"`.                                                                                                                     |
| `render_pulse.route` | The route from `getRoute`.                                                                                                                                                                         |
| `render_pulse.phase` | `"mount"`, `"update"` or `"nested-update"`.                                                                                                                                                        |
| `render_pulse.mode`  | How this measurement was taken: `"profiling"` for `<Profiler>` timings, `"lightweight"` for timing marks. `useRenderMonitor` measurements are always `"lightweight"`, even in a profiling session. |
| `render_pulse.kind`  | `"longtask"` or `"long-animation-frame"`.                                                                                                                                                          |

Every area id and route becomes an attribute value, so keep both bounded: fixed area ids and route templates rather than raw paths. See [Choosing areas](/guide/choosing-areas).

Measurements reach the exporter as they happen (`onRender`, `onLongTask`), not per batch, so the OpenTelemetry SDK does its own aggregation and export timing. They only arrive for sampled sessions.

## Writing your own exporter

`createOtelExporter` is an ordinary `Exporter`. You can write one for any other backend:

```ts
import type { Exporter } from "react-render-pulse";

export const slowRenderLogger: Exporter = {
  onRender(event) {
    if (event.duration > 100) console.warn(`${event.area} took ${event.duration.toFixed(1)} ms on ${event.route}`);
  },
  onLongTask(event) {
    console.warn(`${event.kind} of ${event.duration.toFixed(0)} ms during ${event.area ?? "no monitored area"}`);
  },
  onFlush(payload) {
    // The batch, also sent to the collector when `endpoint` is set.
    console.debug(`batch ${payload.session.seq}: ${payload.summary.renders} renders`);
  },
};
```

Errors thrown in an exporter are caught, so an exporter can't break the app.
