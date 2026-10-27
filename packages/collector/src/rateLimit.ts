export interface RateLimitOptions {
  /** Window length in milliseconds. Defaults to 60000. */
  windowMs?: number | undefined;
  /** Requests allowed per key per window. Defaults to 120. */
  max?: number | undefined;
}

export interface RateLimiter {
  /** Counts a request for `key`. Returns 0 when it's allowed, or the seconds until the key's window resets. */
  hit: (key: string, now?: number) => number;
}

/**
 * A fixed-window limiter kept in memory. On serverless platforms each
 * instance has its own counts, so this limits bursts per instance rather
 * than globally; put a platform rate limit in front for strict limits.
 */
export function createRateLimiter(options: RateLimitOptions = {}): RateLimiter {
  const { windowMs = 60_000, max = 120 } = options;
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    hit(key, now = Date.now()) {
      // Bounds memory: expired windows are dropped once the map gets large.
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
      }

      let window = windows.get(key);
      if (!window || window.resetAt <= now) {
        window = { count: 0, resetAt: now + windowMs };
        windows.set(key, window);
      }

      window.count++;
      return window.count > max ? Math.ceil((window.resetAt - now) / 1000) : 0;
    },
  };
}
