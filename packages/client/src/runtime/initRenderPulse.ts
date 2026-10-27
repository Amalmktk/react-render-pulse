import { createAggregator } from "../aggregate/aggregator.js";
import { getDeviceContext } from "../context/device.js";
import { createRouteReader, defaultGetRoute } from "../context/route.js";
import { createConsoleExporter } from "../export/console.js";
import { createModeDetector } from "../modes/detect.js";
import { observeLongTasks } from "../observe/longtasks.js";
import { createRenderWindows } from "../observe/renderWindows.js";
import { createSessionId, shouldSample } from "../sample/sample.js";
import { serializePayload } from "../transport/payload.js";
import { createTransport } from "../transport/transport.js";
import type { Exporter, LongTaskEvent, Mode, ModeOption, Payload, RenderEvent, RenderPhase } from "../types.js";
import { guard, setDebug } from "./guard.js";
import { getRuntime, setRuntime, type PulseRuntime } from "./runtime.js";

export interface RenderPulseOptions {
  /** Where batches are POSTed. Without one, batches only go to `exporters` (and the console, see `debug`). */
  endpoint?: string | undefined;
  /** Fraction of sessions that collect anything, 0–1, decided once at startup. Defaults to 1. */
  sampleRate?: number | undefined;
  /** `"profiling"`, `"lightweight"`, or `"auto"` (the default): lightweight until React's profiling build is detected. */
  mode?: ModeOption | undefined;
  /** Renders slower than this are counted as slow. Defaults to 16 (one frame at 60 Hz). */
  slowRenderMs?: number | undefined;
  /** Long tasks and long animation frames shorter than this are ignored. Defaults to 50. */
  longTaskMs?: number | undefined;
  /** Your app's version, e.g. from `import.meta.env.VITE_APP_VERSION`, for comparing releases. */
  appVersion?: string | undefined;
  /** Returns the current route, ideally a template like `/orders/:id`. Defaults to the path with numeric segments replaced by `:id`. */
  getRoute?: (() => string) | undefined;
  /** Also sends a batch this often while the page is visible. `0` sends only when the page is hidden. Defaults to 180000 (3 minutes). */
  flushIntervalMs?: number | undefined;
  /** Largest batch in bytes; bigger ones are trimmed. Defaults to 60000, under the 64 KB `sendBeacon` limit. Capped at 65536, the collector's default limit. */
  maxPayloadBytes?: number | undefined;
  /** Most area/route pairs per batch. Defaults to 200, capped at 1000 (the collector's limit). */
  maxAreas?: number | undefined;
  /** Slowest renders kept per area per batch. Defaults to 5, capped at 50 (the collector's limit). */
  worstCases?: number | undefined;
  /** Receive measurements and batches, e.g. `createOtelExporter`. */
  exporters?: Exporter[] | undefined;
  /** Logs each batch to the console and reports internal errors as warnings. Defaults to true when there's no `endpoint`. */
  debug?: boolean | undefined;
}

export interface RenderPulse {
  /** False when this session was left out by `sampleRate`; nothing is measured or sent. */
  readonly sampled: boolean;
  /** The current measurement mode. In `"auto"`, this changes to `"profiling"` once the profiling build is detected. */
  readonly mode: Mode;
  /** Builds a batch from everything measured since the last one and sends it. Returns it, or `null` when there was nothing to send. */
  flush: () => Payload | null;
  /** Stops observing and sending, and detaches `<RenderMonitor>`s, which keep rendering their children as usual. */
  destroy: () => void;
}

const INERT: RenderPulse = { sampled: false, mode: "lightweight", flush: () => null, destroy: () => {} };

let active: { destroy: () => void } | null = null;

/**
 * Starts render-pulse. Call it once, before your app renders. Calling it
 * again replaces the previous setup. On the server it does nothing.
 */
export function initRenderPulse(options: RenderPulseOptions = {}): RenderPulse {
  if (typeof window === "undefined") return INERT;
  return guard(() => start(options), INERT);
}

function start(options: RenderPulseOptions): RenderPulse {
  active?.destroy();

  const {
    endpoint,
    sampleRate = 1,
    mode: modeOption = "auto",
    slowRenderMs = 16,
    longTaskMs = 50,
    flushIntervalMs = 180_000,
    debug = !endpoint,
  } = options;
  // Clamped to what the collector accepts, so a generous setting can't get every batch rejected.
  const maxPayloadBytes = clamp(options.maxPayloadBytes ?? 60_000, 1_000, 65_536);
  const maxAreas = clamp(options.maxAreas ?? 200, 1, 1000);
  const worstCases = clamp(options.worstCases ?? 5, 0, 50);
  const appVersion = options.appVersion?.slice(0, 100);

  setDebug(debug);
  const sampled = shouldSample(sampleRate);
  const now = () => performance.now();
  const sessionStart = now();
  const startedAt = Date.now();
  const sessionId = createSessionId();
  let seq = 0;

  const detector = createModeDetector(modeOption);
  const readRoute = createRouteReader(options.getRoute ?? defaultGetRoute);
  const route = () => guard(readRoute, "/").slice(0, 500);
  const areaId = (id: string) => (id ? id.slice(0, 200) : "(unnamed)");
  const exporters = [...(options.exporters ?? []), ...(debug ? [createConsoleExporter()] : [])];
  const aggregator = createAggregator({ slowRenderMs, maxAreas, worstCases, sessionStart });
  const windows = createRenderWindows();
  const transport = endpoint ? createTransport({ endpoint, maxAttempts: 3, maxQueued: 5 }) : null;

  function record(event: RenderEvent): void {
    aggregator.addRender(event);
    windows.add(event.area, event.startTime, event.endTime, event.duration);
    for (const exporter of exporters) guard(() => exporter.onRender?.(event), undefined);
  }

  function recordLongTask(event: LongTaskEvent): void {
    aggregator.addLongTask(event);
    for (const exporter of exporters) guard(() => exporter.onLongTask?.(event), undefined);
  }

  const runtime: PulseRuntime = {
    sampled,
    now,
    measuresWithMarks: () => sampled && detector.measuresWithMarks(),
    recordMarks(area, phase, startTime, endTime) {
      if (!sampled) return;
      guard(() => {
        const duration = endTime - startTime;
        // Marks measurements are lightweight-mode data even in a profiling session (e.g. from useRenderMonitor).
        record({ area: areaId(area), route: route(), phase, duration, startTime, endTime, mode: "lightweight" });
      }, undefined);
    },
    recordProfiler(area, phase: RenderPhase, actualDuration, startTime, commitTime) {
      if (!sampled) return false;
      return guard(() => {
        detector.profilerFired();
        if (detector.current() !== "profiling") return false;
        record({
          area: areaId(area),
          route: route(),
          phase,
          duration: actualDuration,
          startTime,
          endTime: commitTime,
          mode: "profiling",
        });
        return true;
      }, false);
    },
  };

  function flush(unloading: boolean): Payload | null {
    if (!sampled || aggregator.isEmpty()) return null;

    return guard(() => {
      const batch = aggregator.drain();
      const payload: Payload = {
        v: 1,
        session: {
          id: sessionId,
          seq: ++seq,
          mode: detector.current(),
          route: route(),
          appVersion: appVersion ?? null,
          startedAt,
          sentAt: Date.now(),
        },
        device: getDeviceContext(),
        summary: batch.summary,
        areas: batch.areas,
        longTasks: batch.longTasks,
        longFrames: batch.longFrames,
        dropped: { areas: batch.droppedAreas },
      };

      for (const exporter of exporters) guard(() => exporter.onFlush?.(payload), undefined);

      if (transport) {
        const body = serializePayload(payload, maxPayloadBytes);
        if (body) transport.send(body, { unloading });
      }

      return payload;
    }, null);
  }

  const cleanups: (() => void)[] = [];

  if (sampled) {
    cleanups.push(
      observeLongTasks(longTaskMs, (task) =>
        guard(() => {
          const area = windows.findArea(task.startTime, task.startTime + task.duration);
          recordLongTask({ ...task, area, route: route() });
        }, undefined),
      ),
    );

    // `pagehide` covers browsers (older Safari) that skip `visibilitychange` on unload.
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    const onPageHide = () => flush(true);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    cleanups.push(() => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
    });

    if (flushIntervalMs > 0) {
      const timer = setInterval(() => flush(false), flushIntervalMs);
      cleanups.push(() => clearInterval(timer));
    }
  }

  setRuntime(runtime);

  const instance = {
    destroy() {
      for (const cleanup of cleanups.splice(0)) guard(cleanup, undefined);
      if (getRuntime() === runtime) setRuntime(null);
      if (active === instance) active = null;
    },
  };
  active = instance;

  return {
    sampled,
    get mode() {
      return detector.current();
    },
    flush: () => flush(false),
    destroy: instance.destroy,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : min;
}
