import type { Exporter } from "../types.js";

type Attributes = Record<string, string | number | boolean>;

/**
 * The parts of an OpenTelemetry `Meter` this exporter uses. Structurally
 * compatible with `@opentelemetry/api`'s `Meter`, so there's no dependency on it.
 */
export interface OtelMeterLike {
  createHistogram: (
    name: string,
    options?: { description?: string; unit?: string },
  ) => { record: (value: number, attributes?: Attributes) => void };
  createCounter: (
    name: string,
    options?: { description?: string; unit?: string },
  ) => { add: (value: number, attributes?: Attributes) => void };
}

export interface OtelExporterOptions {
  /** e.g. `metrics.getMeter("my-app")` from `@opentelemetry/api`. */
  meter: OtelMeterLike;
  /** Renders slower than this also increment `render_pulse.render.slow`. Defaults to 16. */
  slowRenderMs?: number | undefined;
}

/**
 * Records every measurement as OpenTelemetry metrics:
 * - `render_pulse.render.duration` (histogram, ms) with `render_pulse.area`, `render_pulse.route`, `render_pulse.phase`, `render_pulse.mode`
 * - `render_pulse.render.slow` (counter) with the same attributes
 * - `render_pulse.longtask.duration` (histogram, ms) with `render_pulse.area`, `render_pulse.route`, `render_pulse.kind`
 */
export function createOtelExporter(options: OtelExporterOptions): Exporter {
  const { meter, slowRenderMs = 16 } = options;

  const renderDuration = meter.createHistogram("render_pulse.render.duration", {
    description: "Render duration of a monitored React area",
    unit: "ms",
  });
  const slowRenders = meter.createCounter("render_pulse.render.slow", {
    description: "Renders slower than the slow-render threshold",
  });
  const longTaskDuration = meter.createHistogram("render_pulse.longtask.duration", {
    description: "Long main-thread tasks and long animation frames",
    unit: "ms",
  });

  return {
    onRender(event) {
      const attributes: Attributes = {
        "render_pulse.area": event.area,
        "render_pulse.route": event.route,
        "render_pulse.phase": event.phase,
        "render_pulse.mode": event.mode,
      };
      renderDuration.record(event.duration, attributes);
      if (event.duration > slowRenderMs) slowRenders.add(1, attributes);
    },
    onLongTask(event) {
      longTaskDuration.record(event.duration, {
        "render_pulse.area": event.area ?? "(none)",
        "render_pulse.route": event.route,
        "render_pulse.kind": event.kind,
      });
    },
  };
}
