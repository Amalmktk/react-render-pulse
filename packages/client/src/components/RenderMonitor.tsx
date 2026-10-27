"use client";

import { Profiler, useCallback, useRef, type ProfilerOnRenderCallback, type ReactNode } from "react";
import { guard } from "../runtime/guard.js";
import { getRuntime } from "../runtime/runtime.js";
import { useIsomorphicLayoutEffect } from "../runtime/useIsomorphicLayoutEffect.js";

export interface RenderMonitorProps {
  /** Names this area in reports, e.g. `"orders-table"`. Areas with the same id are reported together. */
  id: string;
  children?: ReactNode;
}

interface MonitorState {
  id: string;
  mounted: boolean;
  start: number;
  end: number;
  /** The `start` of the last recorded measurement, so StrictMode's repeated effects don't record it twice. */
  recordedStart: number;
  /** The latest marks measurement, waiting to see whether a `<Profiler>` callback for the same commit supersedes it. */
  pending: PendingMeasurement | null;
}

interface PendingMeasurement {
  start: number;
  end: number;
  phase: "mount" | "update";
  superseded: boolean;
}

/**
 * Measures the renders of its children and reports them under `id`.
 *
 * The tree it renders is the same in every mode and whether or not the
 * session is sampled (a `<Profiler>` around two empty marker components), so
 * switching modes or calling `initRenderPulse` late never remounts children.
 * - Profiling mode: React's `<Profiler>` reports each commit's actual render time.
 * - Lightweight mode: the time between the start and end markers rendering,
 *   which brackets the children's render. Updates that start below this area
 *   (a child's own state change) don't re-render the markers, so they aren't
 *   seen; profiling mode catches those.
 */
export function RenderMonitor({ id, children }: RenderMonitorProps): ReactNode {
  const stateRef = useRef<MonitorState | null>(null);
  if (stateRef.current === null) {
    stateRef.current = { id, mounted: false, start: 0, end: 0, recordedStart: -1, pending: null };
  }
  const state = stateRef.current;
  state.id = id;

  const onRender = useCallback<ProfilerOnRenderCallback>(
    (_id, phase, actualDuration, _baseDuration, startTime, commitTime) => {
      // When the Profiler's measurement of this commit is used, a marks measurement of it is a duplicate.
      if (getRuntime()?.recordProfiler(state.id, phase, actualDuration, startTime, commitTime) && state.pending) {
        state.pending.superseded = true;
      }
    },
    [state],
  );

  return (
    <Profiler id={id} onRender={onRender}>
      <StartMarker state={state} />
      {children}
      <EndMarker state={state} />
    </Profiler>
  );
}

function StartMarker({ state }: { state: MonitorState }): null {
  const runtime = getRuntime();
  if (runtime?.measuresWithMarks()) state.start = runtime.now();
  return null;
}

function EndMarker({ state }: { state: MonitorState }): null {
  const runtime = getRuntime();
  if (runtime?.measuresWithMarks()) state.end = runtime.now();

  // Layout effects only run for renders that commit, so abandoned concurrent renders aren't recorded.
  useIsomorphicLayoutEffect(() => {
    guard(() => {
      const current = getRuntime();
      if (!current?.measuresWithMarks() || state.start === state.recordedStart || state.end < state.start) return;

      state.recordedStart = state.start;
      const measurement: PendingMeasurement = {
        start: state.start,
        end: state.end,
        phase: state.mounted ? "update" : "mount",
        superseded: false,
      };
      state.pending = measurement;
      state.mounted = true;

      // The Profiler's callback for this commit (if the profiling build is in
      // use) runs later in the same commit, so wait a microtask before
      // deciding this measurement is the only one. Each commit gets its own
      // object, so several commits in one task are all kept.
      queueMicrotask(() => {
        if (state.pending === measurement) state.pending = null;
        if (!measurement.superseded) {
          getRuntime()?.recordMarks(state.id, measurement.phase, measurement.start, measurement.end);
        }
      });
    }, undefined);
  });

  return null;
}
