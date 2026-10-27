"use client";

import { useRef } from "react";
import { guard } from "../runtime/guard.js";
import { getRuntime } from "../runtime/runtime.js";
import { useIsomorphicLayoutEffect } from "../runtime/useIsomorphicLayoutEffect.js";

/**
 * Tracks the renders of the component that calls it, reported under `id`.
 *
 * Render counts are exact. The duration runs from the hook's call to the
 * commit, so it also includes anything React renders after this component
 * in the same update: an upper bound. Wrap the component in `<RenderMonitor>`
 * when you need its own render time.
 */
export function useRenderMonitor(id: string): void {
  const state = useRef({ start: 0, recordedStart: -1, mounted: false }).current;
  const runtime = getRuntime();
  if (runtime?.sampled) state.start = runtime.now();

  useIsomorphicLayoutEffect(() => {
    guard(() => {
      const current = getRuntime();
      // `recordedStart` stops StrictMode's repeated effects from recording one render twice.
      if (!current?.sampled || state.start === state.recordedStart) return;

      state.recordedStart = state.start;
      current.recordMarks(id, state.mounted ? "update" : "mount", state.start, current.now());
      state.mounted = true;
    }, undefined);
  });
}
