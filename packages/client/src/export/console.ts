import type { Exporter } from "../types.js";

/** Logs each batch as a table, slowest areas first. Used by default when no `endpoint` is set, for local testing. */
export function createConsoleExporter(): Exporter {
  return {
    onFlush(payload) {
      if (typeof console === "undefined") return;

      const rows = [...payload.areas]
        .sort((a, b) => b.p75 - a.p75)
        .map((a) => ({
          area: a.id,
          route: a.route,
          renders: a.renders,
          slow: a.slow,
          p50: a.p50,
          p75: a.p75,
          p95: a.p95,
          max: a.max,
        }));

      console.groupCollapsed(
        `[render-pulse] batch ${payload.session.seq} (${payload.session.mode}): ${payload.summary.renders} renders, ${payload.summary.longTasks} long tasks`,
      );
      if (rows.length > 0) console.table(rows);
      if (payload.longTasks.length > 0) console.table(payload.longTasks);
      if (payload.longFrames.length > 0) console.table(payload.longFrames);
      console.groupEnd();
    },
  };
}
