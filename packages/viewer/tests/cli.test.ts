import { describe, expect, it } from "vitest";
import { formatReport } from "../src/cli/printReport.js";
import { renderTable } from "../src/cli/table.js";
import { parseBatches } from "../src/core/load.js";
import { parseDuration, toBatchQuery } from "../src/core/query.js";
import { buildReport } from "../src/core/report.js";
import { area, batch } from "./fixtures.js";

describe("parseBatches", () => {
  const stored = batch({ areas: [area("table", 5, 1)] });

  it("reads JSON Lines of stored batches, skipping a broken last line", () => {
    const text = `${JSON.stringify(stored)}\n${JSON.stringify(stored)}\n{"receivedAt":`;
    expect(parseBatches(text)).toHaveLength(2);
  });

  it("reads a JSON array of stored batches or payloads", () => {
    expect(parseBatches(JSON.stringify([stored]))).toEqual([stored]);
    const fromPayloads = parseBatches(JSON.stringify([stored.payload]));
    expect(fromPayloads[0]?.receivedAt).toBe(new Date(stored.payload.session.sentAt).toISOString());
  });

  it("reads a single payload, and ignores anything else", () => {
    expect(parseBatches(JSON.stringify(stored.payload))).toHaveLength(1);
    expect(parseBatches(JSON.stringify([{ hello: "world" }, 42]))).toEqual([]);
    expect(parseBatches("   ")).toEqual([]);
  });
});

describe("parseDuration / toBatchQuery", () => {
  it("parses d, h, and m", () => {
    expect(parseDuration("7d")).toBe(7 * 86_400_000);
    expect(parseDuration("24h")).toBe(86_400_000);
    expect(parseDuration("30m")).toBe(1_800_000);
    expect(parseDuration("soon")).toBeNull();
  });

  it("builds a query relative to now", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    expect(toBatchQuery({ since: "1d", version: "2.0.0" }, now)).toEqual({
      since: new Date("2026-10-26T00:00:00Z"),
      appVersion: "2.0.0",
    });
    expect(() => toBatchQuery({ since: "forever" })).toThrow("Invalid duration");
  });
});

describe("renderTable", () => {
  it("aligns text left and numbers right", () => {
    const table = renderTable(
      [
        { name: "orders-table", p75: 11.84 },
        { name: "chart", p75: 2 },
      ],
      [
        { header: "area", value: (r) => r.name },
        { header: "p75", value: (r) => r.p75 },
      ],
    );
    expect(table.split("\n")).toEqual([
      "area           p75",
      "────────────  ────",
      "orders-table  11.8",
      "chart            2",
    ]);
  });
});

describe("formatReport", () => {
  it("says so when there's no data", () => {
    expect(formatReport(buildReport([]))).toBe("No batches found for this filter.");
  });

  it("prints the headline numbers and the slowest areas first", () => {
    const text = formatReport(
      buildReport([
        batch({ session: "a", appVersion: "1.0.0", areas: [area("orders-table", 40, 10), area("filters", 2, 10)] }),
        batch({ session: "b", appVersion: "1.1.0", areas: [area("orders-table", 40, 10)] }),
      ]),
    );

    expect(text).toContain("2 sessions · 30 renders");
    expect(text.indexOf("orders-table")).toBeLessThan(text.indexOf("filters"));
    expect(text).toContain("App versions");
  });
});
