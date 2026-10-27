import type { Payload } from "react-render-pulse";

export interface RunOptions {
  /** Render the app with render-pulse's monitors (true) or the identical tree without them (false). */
  monitored: boolean;
  /**
   * Make the known-slow components spin for their set time (the accuracy
   * pass). Off for overhead runs, so their fixed cost doesn't dilute the result.
   */
  knownSlow?: boolean;
}

interface BenchApi {
  variant: string;
  mode: () => string | null;
  /**
   * Re-renders the whole app `updates` times and returns the mean
   * milliseconds per update. Every update is a synchronous render + commit
   * followed by draining microtasks, so work render-pulse defers to a
   * microtask is inside the measurement, as it would be in a real interaction.
   * The whole block is timed with one pair of clock reads: browsers coarsen
   * `performance.now()` to 0.1 ms, too coarse to time ~1 ms updates one by one.
   */
  run: (updates: number, options: RunOptions) => Promise<number>;
  /** Returns (and clears) the render-pulse batch measured since the last call. */
  collect: () => Payload | null;
}

declare global {
  interface Window {
    __bench?: BenchApi;
  }
}

interface AppControls {
  update: (tick: number) => void;
  setMonitored: (monitored: boolean) => void;
}

let controls: AppControls | null = null;
let knownSlow = false;

export function isKnownSlowEnabled(): boolean {
  return knownSlow;
}

/** Called by <App> with functions that synchronously re-render it (flushSync). */
export function registerControls(next: AppControls): void {
  controls = next;
}

export function setUpBench(options: Pick<BenchApi, "variant" | "collect" | "mode">): void {
  let tick = 0;
  let monitored: boolean | null = null;

  window.__bench = {
    ...options,
    async run(updates, runOptions) {
      if (!controls) throw new Error("App not mounted");
      const app = controls;
      knownSlow = runOptions.knownSlow ?? false;

      if (monitored !== runOptions.monitored) {
        // Switching trees remounts everything; let that settle before timing.
        monitored = runOptions.monitored;
        app.setMonitored(monitored);
        for (let i = 0; i < 10; i++) {
          app.update(++tick);
          await Promise.resolve();
        }
      }

      const start = performance.now();
      for (let i = 0; i < updates; i++) {
        app.update(++tick);
        await Promise.resolve();
      }
      return (performance.now() - start) / updates;
    },
  };
}
