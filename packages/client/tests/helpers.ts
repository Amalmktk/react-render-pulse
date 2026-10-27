import type { Payload, RenderEvent } from "../src/types.js";

/** Blocks the main thread for `ms`, simulating a slow component. */
export function spin(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // busy-wait
  }
}

export function renderEvent(overrides: Partial<RenderEvent> = {}): RenderEvent {
  return {
    area: "table",
    route: "/orders",
    phase: "update",
    duration: 5,
    startTime: 100,
    endTime: 105,
    mode: "lightweight",
    ...overrides,
  };
}

export function payload(overrides: Partial<Payload> = {}): Payload {
  return {
    v: 1,
    session: {
      id: "s1",
      seq: 1,
      mode: "lightweight",
      route: "/orders",
      appVersion: "1.0.0",
      startedAt: 0,
      sentAt: 0,
    },
    device: { memoryGb: 4, cores: 8, connection: "4g", viewport: "390x844" },
    summary: { renders: 0, slowRenders: 0, longTasks: 0, longTaskMs: 0, longFrames: 0, longFrameMs: 0 },
    areas: [],
    longTasks: [],
    longFrames: [],
    dropped: { areas: 0 },
    ...overrides,
  };
}
