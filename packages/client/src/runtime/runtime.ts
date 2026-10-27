import type { RenderPhase } from "../types.js";

/** What `<RenderMonitor>` and `useRenderMonitor` call into. Every method is safe to call and never throws. */
export interface PulseRuntime {
  readonly sampled: boolean;
  /** True when `<RenderMonitor>` should take performance-mark measurements (lightweight mode). */
  measuresWithMarks: () => boolean;
  now: () => number;
  recordMarks: (area: string, phase: RenderPhase, start: number, end: number) => void;
  /** Returns true when the measurement was recorded, i.e. the session is in profiling mode. */
  recordProfiler: (
    area: string,
    phase: RenderPhase,
    actualDuration: number,
    startTime: number,
    commitTime: number,
  ) => boolean;
}

// Kept on globalThis so the ESM and CommonJS builds, or two bundled copies,
// share one runtime instead of a component silently reading an empty one.
const KEY = Symbol.for("react-render-pulse.runtime");

type RuntimeHolder = { [KEY]?: PulseRuntime | null };

export function getRuntime(): PulseRuntime | null {
  return (globalThis as RuntimeHolder)[KEY] ?? null;
}

export function setRuntime(runtime: PulseRuntime | null): void {
  (globalThis as RuntimeHolder)[KEY] = runtime;
}
