import { describe, expect, it } from "vitest";
import { createAggregator, type AggregatorOptions } from "../src/aggregate/aggregator.js";
import { renderEvent } from "./helpers.js";

function aggregator(overrides: Partial<AggregatorOptions> = {}) {
  return createAggregator({ slowRenderMs: 16, maxAreas: 200, worstCases: 3, sessionStart: 0, ...overrides });
}

describe("createAggregator", () => {
  it("starts empty", () => {
    const agg = aggregator();
    expect(agg.isEmpty()).toBe(true);
    expect(agg.drain().areas).toEqual([]);
  });

  it("counts renders, mounts, and slow renders per area and route", () => {
    const agg = aggregator();
    agg.addRender(renderEvent({ phase: "mount", duration: 20 }));
    agg.addRender(renderEvent({ duration: 4 }));
    agg.addRender(renderEvent({ route: "/home", duration: 1 }));

    const { areas, summary } = agg.drain();

    expect(areas).toHaveLength(2);
    expect(areas[0]).toMatchObject({
      id: "table",
      route: "/orders",
      renders: 2,
      mounts: 1,
      slow: 1,
      min: 4,
      max: 20,
      totalMs: 24,
    });
    expect(areas[1]).toMatchObject({ id: "table", route: "/home", renders: 1, slow: 0 });
    expect(summary).toMatchObject({ renders: 3, slowRenders: 1 });
  });

  it("reports percentiles in order", () => {
    const agg = aggregator();
    for (let i = 1; i <= 100; i++) agg.addRender(renderEvent({ duration: i }));

    const [area] = agg.drain().areas;

    expect(area?.p50).toBeLessThanOrEqual(area?.p75 ?? 0);
    expect(area?.p75).toBeLessThanOrEqual(area?.p95 ?? 0);
    expect(area?.p95).toBeLessThanOrEqual(area?.max ?? 0);
    expect(area?.hist.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("keeps only the slowest renders as worst cases, slowest first", () => {
    const agg = aggregator({ worstCases: 2, sessionStart: 100 });
    for (const duration of [5, 50, 1, 30, 2]) agg.addRender(renderEvent({ duration, startTime: 150 }));

    const [area] = agg.drain().areas;

    expect(area?.worst).toEqual([
      { ms: 50, phase: "update", at: 50 },
      { ms: 30, phase: "update", at: 50 },
    ]);
  });

  it("drops new areas past maxAreas and counts them", () => {
    const agg = aggregator({ maxAreas: 1 });
    agg.addRender(renderEvent({ area: "a" }));
    agg.addRender(renderEvent({ area: "b" }));
    agg.addRender(renderEvent({ area: "a" }));

    const batch = agg.drain();

    expect(batch.areas.map((a) => [a.id, a.renders])).toEqual([["a", 2]]);
    expect(batch.droppedAreas).toBe(1);
  });

  it("groups long tasks and long frames by area and route", () => {
    const agg = aggregator();
    agg.addLongTask({ kind: "longtask", area: "table", route: "/orders", startTime: 0, duration: 80 });
    agg.addLongTask({ kind: "longtask", area: "table", route: "/orders", startTime: 0, duration: 120 });
    agg.addLongTask({ kind: "long-animation-frame", area: null, route: "/orders", startTime: 0, duration: 60 });

    const batch = agg.drain();

    expect(batch.longTasks).toEqual([{ area: "table", route: "/orders", count: 2, totalMs: 200, maxMs: 120 }]);
    expect(batch.longFrames).toEqual([{ area: null, route: "/orders", count: 1, totalMs: 60, maxMs: 60 }]);
    expect(batch.summary).toMatchObject({ longTasks: 2, longTaskMs: 200, longFrames: 1, longFrameMs: 60 });
  });

  it("starts a new batch after drain", () => {
    const agg = aggregator();
    agg.addRender(renderEvent());
    agg.drain();
    expect(agg.isEmpty()).toBe(true);
    expect(agg.drain().summary.renders).toBe(0);
  });
});
