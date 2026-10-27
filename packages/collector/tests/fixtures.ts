import type { Payload } from "react-render-pulse/core";

export function validPayload(overrides: Partial<Payload> = {}): Payload {
  return {
    v: 1,
    session: {
      id: "5f0c9a1e-2b7d-4f7e-9d1a-0e6f2c3b4a5d",
      seq: 1,
      mode: "lightweight",
      route: "/orders",
      appVersion: "2.4.0",
      startedAt: 1_760_000_000_000,
      sentAt: 1_760_000_060_000,
    },
    device: { memoryGb: 4, cores: 8, connection: "4g", viewport: "390x844" },
    summary: { renders: 42, slowRenders: 5, longTasks: 3, longTaskMs: 400, longFrames: 0, longFrameMs: 0 },
    areas: [
      {
        id: "orders-table",
        route: "/orders",
        renders: 42,
        mounts: 1,
        slow: 5,
        totalMs: 512.4,
        min: 0.8,
        max: 61.2,
        p50: 6.1,
        p75: 11.8,
        p95: 38.2,
        hist: [0, 2, 5, 10, 8, 12, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0],
        worst: [{ ms: 61.2, phase: "update", at: 5400 }],
      },
    ],
    longTasks: [{ area: "orders-table", route: "/orders", count: 3, totalMs: 400, maxMs: 212 }],
    longFrames: [],
    dropped: { areas: 0 },
    ...overrides,
  };
}

export function post(body: unknown, init: RequestInit & { headers?: Record<string, string> } = {}): Request {
  return new Request("https://collector.test/api/render-pulse", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}
