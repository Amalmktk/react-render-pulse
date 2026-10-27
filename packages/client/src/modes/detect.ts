import type { Mode, ModeOption } from "../types.js";

export interface ModeDetector {
  /** The mode measurements are currently taken in. */
  current: () => Mode;
  /** True when the performance-mark measurements in `<RenderMonitor>` should run. */
  measuresWithMarks: () => boolean;
  /** Called on every `<Profiler>` callback; in `"auto"` mode the first one switches to profiling mode. */
  profilerFired: () => void;
}

/**
 * React only calls `<Profiler onRender>` in development and in its profiling
 * build, so a callback arriving is proof that per-subtree timings are
 * available. There's no public API to ask which build is loaded, and this
 * avoids relying on React internals.
 */
export function createModeDetector(option: ModeOption): ModeDetector {
  let mode: Mode = option === "profiling" ? "profiling" : "lightweight";

  return {
    current: () => mode,
    measuresWithMarks: () => mode === "lightweight",
    profilerFired() {
      if (option === "auto") mode = "profiling";
    },
  };
}
