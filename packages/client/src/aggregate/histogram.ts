/**
 * Upper bounds (ms, inclusive) of the render-duration histogram buckets, plus
 * an implicit overflow bucket. Part of payload v1: the collector merges
 * histograms by index, so changing these needs a new payload version.
 */
export const HISTOGRAM_BOUNDS = [1, 2, 4, 8, 12, 16, 24, 33, 50, 75, 100, 150, 250, 500, 1000] as const;

export function createHistogram(): number[] {
  return new Array<number>(HISTOGRAM_BOUNDS.length + 1).fill(0);
}

export function bucketIndex(ms: number): number {
  for (let i = 0; i < HISTOGRAM_BOUNDS.length; i++) {
    if (ms <= (HISTOGRAM_BOUNDS[i] ?? 0)) return i;
  }
  return HISTOGRAM_BOUNDS.length;
}

/**
 * Estimates a percentile (0–100) from bucket counts, interpolating linearly
 * inside the bucket. The observed `min` and `max` narrow the bucket's range
 * (every value lies between them): without them, durations clustered at a
 * bucket edge, like many renders of exactly 8 ms, would be estimated from
 * the bucket's middle instead.
 */
export function histogramPercentile(hist: readonly number[], p: number, max: number, min = 0): number {
  const total = hist.reduce((sum, n) => sum + n, 0);
  if (total === 0) return 0;

  const target = Math.max((p / 100) * total, Number.MIN_VALUE);
  let seen = 0;

  for (let i = 0; i < hist.length; i++) {
    const count = hist[i] ?? 0;
    if (count === 0) continue;

    if (seen + count >= target) {
      const upper = Math.min(HISTOGRAM_BOUNDS[i] ?? max, max);
      const lower = Math.min(Math.max(i === 0 ? 0 : (HISTOGRAM_BOUNDS[i - 1] ?? 0), min), upper);
      const fraction = (target - seen) / count;
      return round(Math.min(lower + (upper - lower) * fraction, max));
    }

    seen += count;
  }

  return round(max);
}

/** Rounds to 0.1 ms: finer precision isn't meaningful and costs payload bytes. */
export function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}
