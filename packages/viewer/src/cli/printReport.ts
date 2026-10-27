import type { AreaSummary, GroupSummary, Report } from "../core/report.js";
import { renderTable, type Column } from "./table.js";

const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

const groupColumns = (label: string): Column<GroupSummary>[] => [
  { header: label, value: (g) => g.key },
  { header: "sessions", value: (g) => g.sessions },
  { header: "renders", value: (g) => g.renders },
  { header: "slow", value: (g) => percent(g.slowRate), align: "right" },
  { header: "p50 ms", value: (g) => g.p50 },
  { header: "p75 ms", value: (g) => g.p75 },
  { header: "p95 ms", value: (g) => g.p95 },
  { header: "long tasks/session", value: (g) => g.longTasksPerSession },
];

const areaColumns: Column<AreaSummary>[] = [
  { header: "area", value: (a) => a.id },
  { header: "route", value: (a) => a.route },
  { header: "renders", value: (a) => a.renders },
  { header: "slow", value: (a) => percent(a.slowRate), align: "right" },
  { header: "p50 ms", value: (a) => a.p50 },
  { header: "p75 ms", value: (a) => a.p75 },
  { header: "p95 ms", value: (a) => a.p95 },
  { header: "max ms", value: (a) => a.max },
  { header: "long tasks", value: (a) => a.longTasks },
];

/** The terminal version of the report: headline numbers, then the slowest areas, routes, and devices. */
export function formatReport(report: Report, limit = 15): string {
  if (report.batches === 0) return "No batches found for this filter.";

  const { totals } = report;
  const sections = [
    `render-pulse report · ${report.range.from?.slice(0, 10)} → ${report.range.to?.slice(0, 10)}`,
    `${report.sessions.toLocaleString("en-US")} sessions · ${totals.renders.toLocaleString("en-US")} renders · ` +
      `${percent(totals.slowRate)} slow · p75 ${totals.p75} ms · ${totals.longTasksPerSession} long tasks/session`,
    section("Slowest areas (by p75)", renderTable(report.areas.slice(0, limit), areaColumns)),
    section("Routes", renderTable(report.routes.slice(0, limit), groupColumns("route"))),
    section("Devices (memory · cores)", renderTable(report.devices.slice(0, limit), groupColumns("device"))),
    section("Connections", renderTable(report.connections.slice(0, limit), groupColumns("connection"))),
  ];
  if (report.byVersion.length > 1) {
    // Most recent versions last, as they first appeared.
    sections.push(section("App versions", renderTable(report.byVersion.slice(-limit), groupColumns("version"))));
  }
  if (report.droppedAreas > 0) {
    sections.push(
      `Note: ${report.droppedAreas} area entries were dropped by client limits (maxAreas / maxPayloadBytes).`,
    );
  }
  return sections.join("\n\n");
}

function section(title: string, body: string): string {
  return `${title}\n${body}`;
}
