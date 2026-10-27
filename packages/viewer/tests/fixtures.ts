import { HISTOGRAM_BOUNDS, type AreaReport, type Payload } from "react-render-pulse/core";
import type { StoredBatch } from "react-render-pulse-collector";

/** An area whose renders all fall in the bucket containing `ms`. */
export function area(id: string, ms: number, renders: number, route = "/orders"): AreaReport {
  const hist = new Array<number>(HISTOGRAM_BOUNDS.length + 1).fill(0);
  const bucket = HISTOGRAM_BOUNDS.findIndex((bound) => ms <= bound);
  hist[bucket === -1 ? HISTOGRAM_BOUNDS.length : bucket] = renders;
  return {
    id,
    route,
    renders,
    mounts: 1,
    slow: ms > 16 ? renders : 0,
    totalMs: ms * renders,
    min: ms,
    max: ms,
    p50: ms,
    p75: ms,
    p95: ms,
    hist,
    worst: [],
  };
}

export function batch(options: {
  session?: string;
  receivedAt?: string;
  appVersion?: string | null;
  memoryGb?: number | null;
  connection?: string | null;
  areas?: AreaReport[];
  longTasks?: Payload["longTasks"];
}): StoredBatch {
  const receivedAt = options.receivedAt ?? "2026-10-20T10:00:00.000Z";
  return {
    receivedAt,
    payload: {
      v: 1,
      session: {
        id: options.session ?? "s1",
        seq: 1,
        mode: "lightweight",
        route: "/orders",
        appVersion: options.appVersion === undefined ? "1.0.0" : options.appVersion,
        startedAt: Date.parse(receivedAt) - 60_000,
        sentAt: Date.parse(receivedAt),
      },
      device: {
        memoryGb: options.memoryGb === undefined ? 8 : options.memoryGb,
        cores: 8,
        connection: options.connection === undefined ? "4g" : options.connection,
        viewport: "1280x720",
      },
      summary: { renders: 0, slowRenders: 0, longTasks: 0, longTaskMs: 0, longFrames: 0, longFrameMs: 0 },
      areas: options.areas ?? [],
      longTasks: options.longTasks ?? [],
      longFrames: [],
      dropped: { areas: 0 },
    },
  };
}
