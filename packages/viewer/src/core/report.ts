import { HISTOGRAM_BOUNDS, histogramPercentile, type Payload } from "react-render-pulse/core";
import type { StoredBatch } from "react-render-pulse-collector";

/** Render timings merged across every batch in a group. Durations are in milliseconds. */
export interface Timings {
  renders: number;
  slow: number;
  /** `slow / renders`, 0–1. */
  slowRate: number;
  p50: number;
  p75: number;
  p95: number;
  max: number;
}

export interface AreaSummary extends Timings {
  id: string;
  route: string;
  sessions: number;
  mounts: number;
  longTasks: number;
  longTaskMaxMs: number;
}

export interface GroupSummary extends Timings {
  /** The group's label, e.g. a day (`2026-10-27`), an app version, or a device class. */
  key: string;
  sessions: number;
  longTasks: number;
  /** Long tasks per session. */
  longTasksPerSession: number;
}

export interface Report {
  generatedAt: string;
  range: { from: string | null; to: string | null };
  batches: number;
  sessions: number;
  totals: GroupSummary;
  /** Slowest first, by p75. */
  areas: AreaSummary[];
  /** Slowest first, by p75. */
  routes: GroupSummary[];
  /** Device classes (memory · cores), slowest first. */
  devices: GroupSummary[];
  /** Connection types, slowest first. */
  connections: GroupSummary[];
  /** Oldest first. */
  byDay: GroupSummary[];
  /** Oldest first, by when each version was first received. */
  byVersion: GroupSummary[];
  /** Areas left out of batches by the client's limits. */
  droppedAreas: number;
}

interface Accumulator {
  hist: number[];
  renders: number;
  slow: number;
  mounts: number;
  min: number;
  max: number;
  sessions: Set<string>;
  longTasks: number;
  longTaskMaxMs: number;
}

function accumulator(): Accumulator {
  return {
    hist: new Array<number>(HISTOGRAM_BOUNDS.length + 1).fill(0),
    renders: 0,
    slow: 0,
    mounts: 0,
    min: Infinity,
    max: 0,
    sessions: new Set(),
    longTasks: 0,
    longTaskMaxMs: 0,
  };
}

function addArea(acc: Accumulator, area: Payload["areas"][number], sessionId: string): void {
  for (let i = 0; i < acc.hist.length; i++) acc.hist[i] = (acc.hist[i] ?? 0) + (area.hist[i] ?? 0);
  acc.renders += area.renders;
  acc.slow += area.slow;
  acc.mounts += area.mounts;
  if (area.renders > 0) acc.min = Math.min(acc.min, area.min);
  acc.max = Math.max(acc.max, area.max);
  acc.sessions.add(sessionId);
}

function addLongTasks(acc: Accumulator, tasks: Payload["longTasks"], sessionId: string): void {
  for (const task of tasks) {
    acc.longTasks += task.count;
    acc.longTaskMaxMs = Math.max(acc.longTaskMaxMs, task.maxMs);
  }
  if (tasks.length > 0) acc.sessions.add(sessionId);
}

function timings(acc: Accumulator): Timings {
  const min = Number.isFinite(acc.min) ? acc.min : 0;
  return {
    renders: acc.renders,
    slow: acc.slow,
    slowRate: acc.renders === 0 ? 0 : acc.slow / acc.renders,
    // Percentiles come from the merged histograms: averaging per-batch percentiles would be wrong.
    p50: histogramPercentile(acc.hist, 50, acc.max, min),
    p75: histogramPercentile(acc.hist, 75, acc.max, min),
    p95: histogramPercentile(acc.hist, 95, acc.max, min),
    max: acc.max,
  };
}

function group(key: string, acc: Accumulator): GroupSummary {
  const sessions = acc.sessions.size;
  return {
    key,
    ...timings(acc),
    sessions,
    longTasks: acc.longTasks,
    longTasksPerSession: sessions === 0 ? 0 : Math.round((acc.longTasks / sessions) * 100) / 100,
  };
}

function get<K>(map: Map<K, Accumulator>, key: K): Accumulator {
  let acc = map.get(key);
  if (!acc) {
    acc = accumulator();
    map.set(key, acc);
  }
  return acc;
}

/** Groups devices into classes coarse enough that no class identifies a device. */
export function deviceClass(device: Payload["device"]): string {
  const memory = device.memoryGb === null ? "? GB" : `${device.memoryGb} GB`;
  const cores = device.cores === null ? "? cores" : `${device.cores} cores`;
  return `${memory} · ${cores}`;
}

const bySlowest = (a: Timings, b: Timings) => b.p75 - a.p75 || b.renders - a.renders;

/** Merges stored batches into the report the CLI and web viewer show. */
export function buildReport(batches: readonly StoredBatch[], now: Date = new Date()): Report {
  const totals = accumulator();
  const areas = new Map<string, Accumulator & { id: string; route: string }>();
  const routes = new Map<string, Accumulator>();
  const devices = new Map<string, Accumulator>();
  const connections = new Map<string, Accumulator>();
  const days = new Map<string, Accumulator>();
  const versions = new Map<string, Accumulator>();
  const versionFirstSeen = new Map<string, string>();
  let droppedAreas = 0;
  let from: string | null = null;
  let to: string | null = null;

  for (const { receivedAt, payload } of batches) {
    if (from === null || receivedAt < from) from = receivedAt;
    if (to === null || receivedAt > to) to = receivedAt;
    droppedAreas += payload.dropped.areas;

    const sessionId = payload.session.id;
    const version = payload.session.appVersion ?? "unknown";
    const firstSeen = versionFirstSeen.get(version);
    if (firstSeen === undefined || receivedAt < firstSeen) versionFirstSeen.set(version, receivedAt);
    const groups = [
      totals,
      get(devices, deviceClass(payload.device)),
      get(connections, payload.device.connection ?? "unknown"),
      get(days, receivedAt.slice(0, 10)),
      get(versions, version),
    ];

    for (const area of payload.areas) {
      const key = `${area.route}\u0000${area.id}`;
      let areaAcc = areas.get(key);
      if (!areaAcc) {
        areaAcc = { ...accumulator(), id: area.id, route: area.route };
        areas.set(key, areaAcc);
      }
      addArea(areaAcc, area, sessionId);
      addArea(get(routes, area.route), area, sessionId);
      for (const acc of groups) addArea(acc, area, sessionId);
    }

    for (const acc of groups) {
      addLongTasks(acc, payload.longTasks, sessionId);
      acc.sessions.add(sessionId);
    }
    for (const task of payload.longTasks) {
      addLongTasks(get(routes, task.route), [task], sessionId);
      if (task.area === null) continue;
      const areaAcc = areas.get(`${task.route}\u0000${task.area}`);
      if (areaAcc) addLongTasks(areaAcc, [task], sessionId);
    }
  }

  return {
    generatedAt: now.toISOString(),
    range: { from, to },
    batches: batches.length,
    sessions: totals.sessions.size,
    totals: group("all", totals),
    areas: Array.from(areas.values(), (acc) => ({
      id: acc.id,
      route: acc.route,
      ...timings(acc),
      sessions: acc.sessions.size,
      mounts: acc.mounts,
      longTasks: acc.longTasks,
      longTaskMaxMs: acc.longTaskMaxMs,
    })).sort(bySlowest),
    routes: Array.from(routes, ([key, acc]) => group(key, acc)).sort(bySlowest),
    devices: Array.from(devices, ([key, acc]) => group(key, acc)).sort(bySlowest),
    connections: Array.from(connections, ([key, acc]) => group(key, acc)).sort(bySlowest),
    byDay: Array.from(days, ([key, acc]) => group(key, acc)).sort((a, b) => a.key.localeCompare(b.key)),
    // Storage returns batches newest first, so order versions by when they first appeared.
    byVersion: Array.from(versions, ([key, acc]) => group(key, acc)).sort((a, b) =>
      (versionFirstSeen.get(a.key) ?? "").localeCompare(versionFirstSeen.get(b.key) ?? ""),
    ),
    droppedAreas,
  };
}
