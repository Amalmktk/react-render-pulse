import { describe, expect, it, vi } from "vitest";
import { createOtelExporter } from "../src/export/otel.js";
import { renderEvent } from "./helpers.js";

function fakeMeter() {
  const records: { name: string; value: number; attributes: unknown }[] = [];
  return {
    records,
    meter: {
      createHistogram: vi.fn((name: string) => ({
        record: (value: number, attributes?: unknown) => records.push({ name, value, attributes }),
      })),
      createCounter: vi.fn((name: string) => ({
        add: (value: number, attributes?: unknown) => records.push({ name, value, attributes }),
      })),
    },
  };
}

describe("createOtelExporter", () => {
  it("records render durations, and counts slow renders", () => {
    const { meter, records } = fakeMeter();
    const exporter = createOtelExporter({ meter, slowRenderMs: 10 });

    exporter.onRender?.(renderEvent({ duration: 4 }));
    exporter.onRender?.(renderEvent({ duration: 25, phase: "mount" }));

    expect(records).toEqual([
      {
        name: "render_pulse.render.duration",
        value: 4,
        attributes: {
          "render_pulse.area": "table",
          "render_pulse.route": "/orders",
          "render_pulse.phase": "update",
          "render_pulse.mode": "lightweight",
        },
      },
      expect.objectContaining({ name: "render_pulse.render.duration", value: 25 }),
      expect.objectContaining({ name: "render_pulse.render.slow", value: 1 }),
    ]);
  });

  it("records long tasks with their area", () => {
    const { meter, records } = fakeMeter();
    createOtelExporter({ meter }).onLongTask?.({
      kind: "long-animation-frame",
      area: null,
      route: "/",
      startTime: 0,
      duration: 90,
    });

    expect(records).toEqual([
      {
        name: "render_pulse.longtask.duration",
        value: 90,
        attributes: {
          "render_pulse.area": "(none)",
          "render_pulse.route": "/",
          "render_pulse.kind": "long-animation-frame",
        },
      },
    ]);
  });
});
