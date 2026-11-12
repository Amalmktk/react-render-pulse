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

/**
 * An area as a 1.1+ client reports it: `mountMs` for each of `mounts` first renders and `updateMs` for each
 * of `updates` later renders, with the area totals covering both and the same data split by phase.
 */
export function splitArea(
  id: string,
  { mountMs, mounts, updateMs, updates }: { mountMs: number; mounts: number; updateMs: number; updates: number },
  route = "/orders",
): AreaReport {
  const first = area(id, mountMs, mounts, route);
  const later = area(id, updateMs, updates, route);
  const phase = (a: AreaReport) => ({
    renders: a.renders,
    slow: a.slow,
    totalMs: a.totalMs,
    min: a.min,
    max: a.max,
    p50: a.p50,
    p75: a.p75,
    p95: a.p95,
    hist: a.hist,
  });
  return {
    ...area(id, Math.min(mountMs, updateMs), mounts + updates, route),
    mounts,
    slow: first.slow + later.slow,
    totalMs: first.totalMs + later.totalMs,
    min: Math.min(mountMs, updateMs),
    max: Math.max(mountMs, updateMs),
    hist: first.hist.map((n, i) => n + (later.hist[i] ?? 0)),
    phases: { mount: phase(first), update: phase(later) },
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
