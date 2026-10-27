import type { LongTaskKind } from "../types.js";

export interface ObservedLongTask {
  kind: LongTaskKind;
  startTime: number;
  duration: number;
}

/**
 * Observes long tasks (Chromium) and long animation frames (Chromium 123+)
 * at or above `thresholdMs`. Entry types the browser doesn't support are
 * skipped. Returns a function that stops observing.
 */
export function observeLongTasks(thresholdMs: number, onEntry: (task: ObservedLongTask) => void): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};

  const supported = PerformanceObserver.supportedEntryTypes ?? [];
  const observers: PerformanceObserver[] = [];

  for (const kind of ["longtask", "long-animation-frame"] as const) {
    if (!supported.includes(kind)) continue;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < thresholdMs) continue;
          onEntry({ kind, startTime: entry.startTime, duration: entry.duration });
        }
      });
      observer.observe({ type: kind, buffered: true });
      observers.push(observer);
    } catch {
      // Observing is best-effort; a browser quirk here must not reach the app.
    }
  }

  return () => {
    for (const observer of observers) observer.disconnect();
  };
}
