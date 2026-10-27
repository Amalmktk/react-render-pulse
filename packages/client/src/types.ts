/** How render durations are measured. See the "Modes" guide. */
export type Mode = "profiling" | "lightweight";

/** `"auto"` starts in lightweight mode and switches to profiling mode once React's profiling build is detected. */
export type ModeOption = Mode | "auto";

/** Mirrors the `phase` React's `<Profiler>` reports. */
export type RenderPhase = "mount" | "update" | "nested-update";

/** One measured commit of one monitored area. Times are on the `performance.now()` timeline, in milliseconds. */
export interface RenderEvent {
  /** The `id` given to `<RenderMonitor>` or `useRenderMonitor`. */
  area: string;
  route: string;
  phase: RenderPhase;
  duration: number;
  startTime: number;
  endTime: number;
  /** How this measurement was taken: `"profiling"` for `<Profiler>` timings, `"lightweight"` for marks (including every `useRenderMonitor` measurement). */
  mode: Mode;
}

export type LongTaskKind = "longtask" | "long-animation-frame";

/** A main-thread block reported by a `PerformanceObserver`, tagged with the monitored area that was rendering. */
export interface LongTaskEvent {
  kind: LongTaskKind;
  /**
   * The area blamed for the block: of the renders that overlapped it, the
   * innermost one that accounts for at least half of the longest. `null`
   * when no recent render overlapped it (e.g. work in an event handler).
   */
  area: string | null;
  route: string;
  startTime: number;
  duration: number;
}

/**
 * Receives measurements as they happen (`onRender`, `onLongTask`) and the
 * batch on each flush (`onFlush`). Errors thrown here are caught, so an
 * exporter can never break the app.
 */
export interface Exporter {
  onRender?: ((event: RenderEvent) => void) | undefined;
  onLongTask?: ((event: LongTaskEvent) => void) | undefined;
  onFlush?: ((payload: Payload) => void) | undefined;
}

/** Device details from browser APIs. `null` when the browser doesn't expose one. */
export interface DeviceContext {
  memoryGb: number | null;
  cores: number | null;
  /** `navigator.connection.effectiveType`, e.g. `"4g"`. */
  connection: string | null;
  /** `${innerWidth}x${innerHeight}` in CSS pixels. */
  viewport: string;
}

export interface SessionInfo {
  /** Random per page load and never stored on the device, so it can't identify a user. Lets the collector group batches. */
  id: string;
  /** Batch number within the session, starting at 1. */
  seq: number;
  mode: Mode;
  /** The route when the batch was built. */
  route: string;
  appVersion: string | null;
  /** Epoch milliseconds when the session started and when this batch was built. */
  startedAt: number;
  sentAt: number;
}

/** One of the slowest renders of an area in a batch. */
export interface WorstCase {
  ms: number;
  phase: RenderPhase;
  /** Milliseconds since the session started. */
  at: number;
}

/** Render timings for one area on one route, for one batch. Durations are in milliseconds. */
export interface AreaReport {
  id: string;
  route: string;
  renders: number;
  mounts: number;
  /** Renders slower than `slowRenderMs`. */
  slow: number;
  totalMs: number;
  /** Fastest render; with `max`, it bounds percentile estimates from merged histograms. */
  min: number;
  max: number;
  p50: number;
  p75: number;
  p95: number;
  /** Render counts per `HISTOGRAM_BOUNDS` bucket, plus a final overflow bucket. Histograms from many batches can be added together. */
  hist: number[];
  worst: WorstCase[];
}

export interface LongTaskReport {
  area: string | null;
  route: string;
  count: number;
  totalMs: number;
  maxMs: number;
}

/** Totals for the whole batch, across every area and route. */
export interface SessionSummary {
  renders: number;
  slowRenders: number;
  longTasks: number;
  longTaskMs: number;
  longFrames: number;
  longFrameMs: number;
}

/** What gets sent to the collector. Durations are in milliseconds; no user IDs, IP addresses, or page text. */
export interface Payload {
  v: 1;
  session: SessionInfo;
  device: DeviceContext;
  summary: SessionSummary;
  areas: AreaReport[];
  longTasks: LongTaskReport[];
  longFrames: LongTaskReport[];
  /** Areas left out to respect `maxAreas` or `maxPayloadBytes`. */
  dropped: { areas: number };
}
