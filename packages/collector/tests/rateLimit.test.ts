import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/rateLimit.js";

describe("createRateLimiter", () => {
  it("allows up to max per window, then returns the seconds to wait", () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 10_000 });
    expect(limiter.hit("a", 0)).toBe(0);
    expect(limiter.hit("a", 1000)).toBe(0);
    expect(limiter.hit("a", 2000)).toBe(8);
  });

  it("resets after the window", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(limiter.hit("a", 0)).toBe(0);
    expect(limiter.hit("a", 500)).toBe(1);
    expect(limiter.hit("a", 1000)).toBe(0);
  });

  it("tracks keys separately", () => {
    const limiter = createRateLimiter({ max: 1 });
    expect(limiter.hit("a", 0)).toBe(0);
    expect(limiter.hit("b", 0)).toBe(0);
  });
});
