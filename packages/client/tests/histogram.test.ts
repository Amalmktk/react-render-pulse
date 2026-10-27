import { describe, expect, it } from "vitest";
import {
  bucketIndex,
  createHistogram,
  HISTOGRAM_BOUNDS,
  histogramPercentile,
  round,
} from "../src/aggregate/histogram.js";

function histogramOf(values: number[]): number[] {
  const hist = createHistogram();
  for (const value of values) {
    const i = bucketIndex(value);
    hist[i] = (hist[i] ?? 0) + 1;
  }
  return hist;
}

describe("bucketIndex", () => {
  it("puts values in the first bucket whose upper bound is at least the value", () => {
    expect(bucketIndex(0)).toBe(0);
    expect(bucketIndex(1)).toBe(0);
    expect(bucketIndex(1.01)).toBe(1);
    expect(bucketIndex(16)).toBe(HISTOGRAM_BOUNDS.indexOf(16));
  });

  it("uses the overflow bucket past the last bound", () => {
    expect(bucketIndex(5000)).toBe(HISTOGRAM_BOUNDS.length);
  });
});

describe("histogramPercentile", () => {
  it("returns 0 for an empty histogram", () => {
    expect(histogramPercentile(createHistogram(), 50, 0)).toBe(0);
  });

  it("interpolates inside the bucket", () => {
    // 10 values in (8, 12] with a max of 12: the median lands halfway through the bucket.
    const hist = histogramOf([...new Array(9).fill(10), 12]);
    expect(histogramPercentile(hist, 50, 12)).toBe(10);
  });

  it("uses the observed min, so values clustered at a bucket edge aren't pulled down", () => {
    // 30 renders of exactly 8 ms sit at the top edge of (4, 8].
    const hist = histogramOf(new Array(30).fill(8));
    expect(histogramPercentile(hist, 50, 8)).toBe(6);
    expect(histogramPercentile(hist, 50, 8, 8)).toBe(8);
  });

  it("never exceeds the observed max", () => {
    const hist = histogramOf([3, 3, 3]);
    expect(histogramPercentile(hist, 95, 3)).toBeLessThanOrEqual(3);
  });

  it("bounds the overflow bucket by the max", () => {
    const hist = histogramOf([2000]);
    expect(histogramPercentile(hist, 99, 2000)).toBeLessThanOrEqual(2000);
    expect(histogramPercentile(hist, 99, 2000)).toBeGreaterThan(1000);
  });

  it("stays within one bucket of the exact percentile", () => {
    const values = Array.from({ length: 200 }, (_, i) => (i % 40) + 0.5);
    const sorted = [...values].sort((a, b) => a - b);
    const exactP75 = sorted[Math.ceil(0.75 * sorted.length) - 1] ?? 0;
    const estimate = histogramPercentile(histogramOf(values), 75, Math.max(...values));

    expect(bucketIndex(estimate)).toBeGreaterThanOrEqual(bucketIndex(exactP75) - 1);
    expect(bucketIndex(estimate)).toBeLessThanOrEqual(bucketIndex(exactP75) + 1);
  });
});

describe("round", () => {
  it("rounds to 0.1 ms", () => {
    expect(round(1.234)).toBe(1.2);
    expect(round(1.25)).toBe(1.3);
  });
});
