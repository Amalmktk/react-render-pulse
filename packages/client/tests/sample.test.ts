import { describe, expect, it } from "vitest";
import { createSessionId, shouldSample } from "../src/sample/sample.js";

describe("shouldSample", () => {
  it("always samples at 1 and never at 0", () => {
    expect(shouldSample(1, () => 0.999)).toBe(true);
    expect(shouldSample(0, () => 0)).toBe(false);
  });

  it("compares the random draw against the rate", () => {
    expect(shouldSample(0.05, () => 0.04)).toBe(true);
    expect(shouldSample(0.05, () => 0.05)).toBe(false);
  });

  it("treats invalid rates as 0", () => {
    expect(shouldSample(Number.NaN, () => 0)).toBe(false);
    expect(shouldSample(-1, () => 0)).toBe(false);
  });

  it("samples roughly the requested fraction", () => {
    let sampled = 0;
    for (let i = 0; i < 10_000; i++) if (shouldSample(0.1)) sampled++;
    expect(sampled).toBeGreaterThan(800);
    expect(sampled).toBeLessThan(1200);
  });
});

describe("createSessionId", () => {
  it("returns a different id each time", () => {
    expect(createSessionId()).not.toBe(createSessionId());
  });
});
