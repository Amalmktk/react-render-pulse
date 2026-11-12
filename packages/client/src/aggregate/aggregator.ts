import { bucketIndex, createHistogram, histogramPercentile, round } from "./histogram.js";
import type {
  AreaReport,
  LongTaskEvent,
  LongTaskReport,
  PhaseTimings,
  RenderEvent,
  SessionSummary,
  WorstCase,
} from "../types.js";

export interface AggregatorOptions {
  /** Renders slower than this count as slow. */
  slowRenderMs: number;
  /** Most distinct area/route pairs kept per batch; renders for new ones past this are dropped. */
  maxAreas: number;
  /** How many of the slowest renders to keep per area. */
  worstCases: number;
  /** `performance.now()` at session start, so worst cases report time since then. */
  sessionStart: number;
}

export interface AggregatedBatch {
  summary: SessionSummary;
  areas: AreaReport[];
  longTasks: LongTaskReport[];
  longFrames: LongTaskReport[];
  droppedAreas: number;
}

export interface Aggregator {
  addRender: (event: RenderEvent) => void;
  addLongTask: (event: LongTaskEvent) => void;
  /** True when nothing was recorded since the last `drain()`. */
  isEmpty: () => boolean;
  /** Returns everything recorded since the last call, and starts a new batch. */
  drain: () => AggregatedBatch;
}

/** Timings for a set of renders: one area, or one phase of an area. */
interface TimingsAccumulator {
  renders: number;
  slow: number;
  totalMs: number;
  min: number;
  max: number;
  hist: number[];
}

interface AreaAccumulator extends TimingsAccumulator {
  id: string;
  route: string;
  mounts: number;
  /** First renders and later renders (updates, including nested updates) kept apart. */
  mount: TimingsAccumulator;
  update: TimingsAccumulator;
  worst: WorstCase[];
}

function timingsAccumulator(): TimingsAccumulator {
  return { renders: 0, slow: 0, totalMs: 0, min: Infinity, max: 0, hist: createHistogram() };
}

function addTiming(acc: TimingsAccumulator, ms: number, slowRenderMs: number): void {
  acc.renders++;
  if (ms > slowRenderMs) acc.slow++;
  acc.totalMs += ms;
  acc.min = Math.min(acc.min, ms);
  acc.max = Math.max(acc.max, ms);
  const bucket = bucketIndex(ms);
  acc.hist[bucket] = (acc.hist[bucket] ?? 0) + 1;
}

interface LongTaskAccumulator {
  area: string | null;
  route: string;
  count: number;
  totalMs: number;
  maxMs: number;
}

// Only counts, histograms, and a few worst cases are kept, never raw event
// streams, so memory stays flat however long the session runs.
export function createAggregator(options: AggregatorOptions): Aggregator {
  let areas = new Map<string, AreaAccumulator>();
  let longTasks = new Map<string, LongTaskAccumulator>();
  let longFrames = new Map<string, LongTaskAccumulator>();
  let droppedAreas = 0;

  function addRender(event: RenderEvent): void {
    const key = `${event.route}\u0000${event.area}`;
    let area = areas.get(key);

    if (!area) {
      if (areas.size >= options.maxAreas) {
        droppedAreas++;
        return;
      }
      area = {
        ...timingsAccumulator(),
        id: event.area,
        route: event.route,
        mounts: 0,
        mount: timingsAccumulator(),
        update: timingsAccumulator(),
        worst: [],
      };
      areas.set(key, area);
    }

    const ms = event.duration;
    if (event.phase === "mount") area.mounts++;
    addTiming(area, ms, options.slowRenderMs);
    addTiming(event.phase === "mount" ? area.mount : area.update, ms, options.slowRenderMs);
    addWorstCase(area.worst, { ms, phase: event.phase, at: event.startTime - options.sessionStart });
  }

  function addWorstCase(worst: WorstCase[], candidate: WorstCase): void {
    if (worst.length < options.worstCases) {
      worst.push(candidate);
    } else {
      const fastest = worst.reduce((min, w, i) => (w.ms < (worst[min]?.ms ?? 0) ? i : min), 0);
      if (candidate.ms <= (worst[fastest]?.ms ?? 0)) return;
      worst[fastest] = candidate;
    }
  }

  function addLongTask(event: LongTaskEvent): void {
    const target = event.kind === "longtask" ? longTasks : longFrames;
    const key = `${event.route}\u0000${event.area ?? ""}`;
    let entry = target.get(key);

    if (!entry) {
      entry = { area: event.area, route: event.route, count: 0, totalMs: 0, maxMs: 0 };
      target.set(key, entry);
    }

    entry.count++;
    entry.totalMs += event.duration;
    entry.maxMs = Math.max(entry.maxMs, event.duration);
  }

  function drain(): AggregatedBatch {
    const areaReports = Array.from(areas.values(), toAreaReport);
    const taskReports = Array.from(longTasks.values(), toLongTaskReport);
    const frameReports = Array.from(longFrames.values(), toLongTaskReport);

    const batch: AggregatedBatch = {
      summary: {
        renders: sum(areaReports, (a) => a.renders),
        slowRenders: sum(areaReports, (a) => a.slow),
        longTasks: sum(taskReports, (t) => t.count),
        longTaskMs: round(sum(taskReports, (t) => t.totalMs)),
        longFrames: sum(frameReports, (t) => t.count),
        longFrameMs: round(sum(frameReports, (t) => t.totalMs)),
      },
      areas: areaReports,
      longTasks: taskReports,
      longFrames: frameReports,
      droppedAreas,
    };

    areas = new Map();
    longTasks = new Map();
    longFrames = new Map();
    droppedAreas = 0;
    return batch;
  }

  return {
    addRender,
    addLongTask,
    isEmpty: () => areas.size === 0 && longTasks.size === 0 && longFrames.size === 0 && droppedAreas === 0,
    drain,
  };
}

function toPhaseTimings(acc: TimingsAccumulator): PhaseTimings {
  return {
    renders: acc.renders,
    slow: acc.slow,
    totalMs: round(acc.totalMs),
    min: round(acc.min),
    max: round(acc.max),
    p50: histogramPercentile(acc.hist, 50, acc.max, acc.min),
    p75: histogramPercentile(acc.hist, 75, acc.max, acc.min),
    p95: histogramPercentile(acc.hist, 95, acc.max, acc.min),
    hist: acc.hist,
  };
}

function toAreaReport(area: AreaAccumulator): AreaReport {
  return {
    id: area.id,
    route: area.route,
    mounts: area.mounts,
    ...toPhaseTimings(area),
    // A phase with no renders in this batch is left out
    phases: {
      ...(area.mount.renders > 0 && { mount: toPhaseTimings(area.mount) }),
      ...(area.update.renders > 0 && { update: toPhaseTimings(area.update) }),
    },
    worst: area.worst
      .sort((a, b) => b.ms - a.ms)
      .map((w) => ({ ms: round(w.ms), phase: w.phase, at: Math.round(w.at) })),
  };
}

function toLongTaskReport(entry: LongTaskAccumulator): LongTaskReport {
  return { ...entry, totalMs: round(entry.totalMs), maxMs: round(entry.maxMs) };
}

function sum<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}
