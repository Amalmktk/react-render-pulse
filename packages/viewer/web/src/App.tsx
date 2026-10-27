import { useEffect, useState } from "react";
import type { AreaSummary, GroupSummary } from "../../src/core/report";
import type { ReportResponse } from "../../src/server/server";
import { ColumnChart, LineChart, type Point } from "./charts";
import { compact, ms, percent } from "./format";

const RANGES = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "", label: "All time" },
];

function toPoint(group: GroupSummary): Point {
  return {
    label: group.key,
    value: group.p75,
    detail: [
      `${compact(group.renders)} renders`,
      `${compact(group.sessions)} sessions`,
      `${percent(group.slowRate)} slow`,
    ],
  };
}

export function App() {
  const [since, setSince] = useState("30d");
  const [version, setVersion] = useState("");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    if (version) params.set("version", version);

    setLoading(true);
    fetch(`./api/report?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? response.statusText);
        return response.json() as Promise<ReportResponse>;
      })
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [since, version]);

  const report = data?.report;

  return (
    <div className="page">
      <header className="header">
        <h1>render-pulse</h1>
        <p className="subtitle">Component render performance from real users</p>
      </header>

      <fieldset className="filters">
        <legend className="visually-hidden">Filters</legend>
        <label>
          <span>Range</span>
          <select value={since} onChange={(e) => setSince(e.target.value)}>
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>App version</span>
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            <option value="">All versions</option>
            {data?.versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {error && <p className="error">Couldn't load the report: {error}</p>}

      {report && report.batches === 0 && <p className="empty">No data for this filter yet.</p>}

      {/* While refetching, the previous render stays at reduced opacity: no layout jump. */}
      {report && report.batches > 0 && (
        <main className={loading ? "content loading" : "content"} aria-busy={loading}>
          <section className="tiles">
            <Tile label="Sessions" value={compact(report.sessions)} />
            <Tile label="Renders" value={compact(report.totals.renders)} />
            <Tile label="Slow renders" value={percent(report.totals.slowRate)} />
            <Tile label="p75 render" value={ms(report.totals.p75)} />
            <Tile label="Long tasks per session" value={report.totals.longTasksPerSession.toFixed(2)} />
          </section>

          <div className="grid-2">
            <section className="card">
              <h2>p75 render time by day</h2>
              <LineChart points={report.byDay.map(toPoint)} format={ms} title="p75 render time by day" />
            </section>
            <section className="card">
              <h2>p75 render time by app version</h2>
              <ColumnChart points={report.byVersion.map(toPoint)} format={ms} title="p75 render time by app version" />
            </section>
          </div>

          <section className="card">
            <h2>Slowest areas</h2>
            <AreasTable areas={report.areas.slice(0, 25)} />
          </section>

          <div className="grid-2">
            <section className="card">
              <h2>Worst devices</h2>
              <GroupTable rows={report.devices.slice(0, 10)} label="Memory · cores" />
            </section>
            <section className="card">
              <h2>Connections</h2>
              <GroupTable rows={report.connections} label="Connection" />
            </section>
          </div>

          <section className="card">
            <h2>Routes</h2>
            <GroupTable rows={report.routes.slice(0, 25)} label="Route" />
          </section>

          {report.droppedAreas > 0 && (
            <p className="note">
              {report.droppedAreas} area entries were dropped by client limits (maxAreas / maxPayloadBytes).
            </p>
          )}
        </main>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
    </div>
  );
}

function AreasTable({ areas }: { areas: AreaSummary[] }) {
  const maxP75 = Math.max(...areas.map((a) => a.p75), 1);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">Route</th>
            <th scope="col" className="num">
              p75
            </th>
            <td />
            <th scope="col" className="num">
              p95
            </th>
            <th scope="col" className="num">
              Renders
            </th>
            <th scope="col" className="num">
              Slow
            </th>
            <th scope="col" className="num">
              Long tasks
            </th>
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => (
            <tr key={`${a.route}\u0000${a.id}`}>
              <td className="strong">{a.id}</td>
              <td className="muted">{a.route}</td>
              <td className="num">{ms(a.p75)}</td>
              <td className="bar-cell" aria-hidden="true">
                <div className="bar" style={{ width: `${(a.p75 / maxP75) * 100}%` }} />
              </td>
              <td className="num">{ms(a.p95)}</td>
              <td className="num">{compact(a.renders)}</td>
              <td className="num">{percent(a.slowRate)}</td>
              <td className="num">{compact(a.longTasks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupTable({ rows, label }: { rows: GroupSummary[]; label: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col" className="num">
              Sessions
            </th>
            <th scope="col" className="num">
              p75
            </th>
            <th scope="col" className="num">
              Slow
            </th>
            <th scope="col" className="num">
              Long tasks/session
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td className="strong">{g.key}</td>
              <td className="num">{compact(g.sessions)}</td>
              <td className="num">{ms(g.p75)}</td>
              <td className="num">{percent(g.slowRate)}</td>
              <td className="num">{g.longTasksPerSession.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
