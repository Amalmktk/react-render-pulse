import { bucketIndex, createHistogram, histogramPercentile, round } from "./histogram.js";
import type { AreaReport, LongTaskEvent, LongTaskReport, RenderEvent, SessionSummary, WorstCase } from "../types.js";

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

interface AreaAccumulator {
  id: string;
  route: string;
  renders: number;
  mounts: number;
  slow: number;
  totalMs: number;
  min: number;
  max: number;
  hist: number[];
  worst: WorstCase[];
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
        id: event.area,
        route: event.route,
        renders: 0,
        mounts: 0,
        slow: 0,
        totalMs: 0,
        min: Infinity,
        max: 0,
        hist: createHistogram(),
        worst: [],
      };
      areas.set(key, area);
    }

    const ms = event.duration;
    area.renders++;
    if (event.phase === "mount") area.mounts++;
    if (ms > options.slowRenderMs) area.slow++;
    area.totalMs += ms;
    area.min = Math.min(area.min, ms);
    area.max = Math.max(area.max, ms);
    const bucket = bucketIndex(ms);
    area.hist[bucket] = (area.hist[bucket] ?? 0) + 1;
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

function toAreaReport(area: AreaAccumulator): AreaReport {
  return {
    id: area.id,
    route: area.route,
    renders: area.renders,
    mounts: area.mounts,
    slow: area.slow,
    totalMs: round(area.totalMs),
    min: round(area.min),
    max: round(area.max),
    p50: histogramPercentile(area.hist, 50, area.max, area.min),
    p75: histogramPercentile(area.hist, 75, area.max, area.min),
    p95: histogramPercentile(area.hist, 95, area.max, area.min),
    hist: area.hist,
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
