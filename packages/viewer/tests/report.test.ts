import { describe, expect, it } from "vitest";
import { buildReport, deviceClass } from "../src/core/report.js";
import { area, batch } from "./fixtures.js";

describe("buildReport", () => {
  it("returns an empty report for no batches", () => {
    const report = buildReport([], new Date("2026-10-27T00:00:00Z"));
    expect(report).toMatchObject({ batches: 0, sessions: 0, areas: [], range: { from: null, to: null } });
  });

  it("merges an area across batches and ranks the slowest first", () => {
    const report = buildReport([
      batch({ session: "a", areas: [area("table", 40, 10), area("filters", 2, 50)] }),
      batch({ session: "b", areas: [area("table", 40, 10)] }),
    ]);

    expect(report.areas.map((a) => [a.id, a.renders, a.sessions])).toEqual([
      ["table", 20, 2],
      ["filters", 50, 1],
    ]);
    expect(report.areas[0]?.slowRate).toBe(1);
    expect(report.sessions).toBe(2);
  });

  it("computes percentiles from merged histograms, not averaged percentiles", () => {
    // 90 fast renders in one session, 10 slow in another: p95 must be slow.
    const report = buildReport([
      batch({ session: "a", areas: [area("table", 2, 90)] }),
      batch({ session: "b", areas: [area("table", 200, 10)] }),
    ]);

    const [table] = report.areas;
    expect(table?.p50).toBeLessThanOrEqual(2);
    expect(table?.p95).toBeGreaterThan(150);
  });

  it("keeps the same area on different routes apart", () => {
    const report = buildReport([batch({ areas: [area("table", 5, 1, "/orders"), area("table", 5, 1, "/users")] })]);
    expect(report.areas.map((a) => a.route).sort()).toEqual(["/orders", "/users"]);
    expect(report.routes.map((r) => r.key).sort()).toEqual(["/orders", "/users"]);
  });

  it("groups by device class, connection, day, and version", () => {
    const report = buildReport([
      batch({
        session: "a",
        memoryGb: 2,
        connection: "3g",
        receivedAt: "2026-10-20T10:00:00.000Z",
        appVersion: "1.0.0",
        areas: [area("t", 60, 5)],
      }),
      batch({
        session: "b",
        memoryGb: 8,
        connection: "4g",
        receivedAt: "2026-10-21T10:00:00.000Z",
        appVersion: "1.1.0",
        areas: [area("t", 3, 5)],
      }),
      batch({
        session: "c",
        memoryGb: null,
        connection: null,
        receivedAt: "2026-10-21T11:00:00.000Z",
        appVersion: null,
        areas: [area("t", 3, 5)],
      }),
    ]);

    expect(report.devices[0]?.key).toBe("2 GB · 8 cores");
    expect(report.devices.map((d) => d.key)).toContain("? GB · 8 cores");
    expect(report.connections[0]?.key).toBe("3g");
    expect(report.connections.map((c) => c.key)).toContain("unknown");
    expect(report.byDay.map((d) => [d.key, d.sessions])).toEqual([
      ["2026-10-20", 1],
      ["2026-10-21", 2],
    ]);
    expect(report.byVersion.map((v) => v.key)).toEqual(["1.0.0", "1.1.0", "unknown"]);

    // Same data newest first, as storage returns it: versions still oldest first.
    const reversed = buildReport([
      batch({ session: "b", receivedAt: "2026-10-21T10:00:00.000Z", appVersion: "1.1.0", areas: [area("t", 3, 5)] }),
      batch({ session: "a", receivedAt: "2026-10-20T10:00:00.000Z", appVersion: "1.0.0", areas: [area("t", 3, 5)] }),
    ]);
    expect(reversed.byVersion.map((v) => v.key)).toEqual(["1.0.0", "1.1.0"]);
    expect(report.range).toEqual({ from: "2026-10-20T10:00:00.000Z", to: "2026-10-21T11:00:00.000Z" });
  });

  it("attributes long tasks to areas and counts them per session", () => {
    const report = buildReport([
      batch({
        session: "a",
        areas: [area("table", 30, 3)],
        longTasks: [
          { area: "table", route: "/orders", count: 2, totalMs: 300, maxMs: 200 },
          { area: null, route: "/orders", count: 1, totalMs: 60, maxMs: 60 },
        ],
      }),
      batch({ session: "b", areas: [area("table", 30, 3)] }),
    ]);

    expect(report.areas[0]).toMatchObject({ longTasks: 2, longTaskMaxMs: 200 });
    expect(report.routes[0]).toMatchObject({ key: "/orders", longTasks: 3, longTasksPerSession: 1.5 });
    expect(report.totals.longTasks).toBe(3);
    expect(report.totals.longTasksPerSession).toBe(1.5);
  });
});

describe("deviceClass", () => {
  it("labels memory and cores", () => {
    expect(deviceClass({ memoryGb: 4, cores: 6, connection: null, viewport: "1x1" })).toBe("4 GB · 6 cores");
  });
});
