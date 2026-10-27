# react-render-pulse-viewer

A CLI, a local web viewer, and the functions behind them. Requires Node 20 or later. See the [viewer guide](/guide/viewer) for reading reports.

## CLI

```
react-render-pulse-viewer report <file>
react-render-pulse-viewer report --db <url>
react-render-pulse-viewer serve --db <url>
react-render-pulse-viewer serve --file <file>
```

| Command               | Description                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `report <file>`       | Print a report from a JSON or JSON Lines export. `react-render-pulse-viewer <file>` is shorthand. |
| `report --db <url>`   | Print a report from Postgres.                                                                     |
| `serve --db <url>`    | Serve the web viewer on Postgres data.                                                            |
| `serve --file <file>` | Serve the web viewer on a file, re-read on every request.                                         |

| Flag                  | Default                | Description                                                                         |
| --------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `--since <duration>`  | all time               | `report` only: batches from the last `<n>d`, `<n>h` or `<n>m`, e.g. `7d`.           |
| `--app-version <ver>` | all versions           | `report` only: batches from this app version, or `unknown` for batches without one. |
| `--limit <n>`         | `15`                   | `report` only: rows per table (for app versions, the most recent ones).             |
| `--json`              | off                    | `report` only: print the `Report` as JSON.                                          |
| `--table <name>`      | `render_pulse_batches` | Postgres table, with `--db`.                                                        |
| `--port <n>`          | `4173`                 | `serve` only: port.                                                                 |
| `--host <host>`       | `127.0.0.1`            | `serve` only: interface to bind.                                                    |
| `-h`, `--help`        |                        | Show help.                                                                          |

Exit codes: `0` on success, `1` on errors or when run without arguments (help is printed). `serve` runs until interrupted. With `--db` the viewer never creates or alters tables.

## Web viewer API

`serve` answers `GET` and `HEAD` only.

| Path                                      | Response                                                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/report?since=30d&version=2.4.0` | `ReportResponse`: `{ report: Report, versions: string[] }`. Both parameters are optional. `versions` lists every app version in the time range, for the version filter. Invalid `since` returns `400`. |
| Any other path                            | The web viewer's static files.                                                                                                                                                                         |

## Functions

```ts
import {
  buildReport,
  createViewerServer,
  deviceClass,
  formatReport,
  loadBatchesFromFile,
  parseBatches,
  parseDuration,
  toBatchQuery,
} from "react-render-pulse-viewer";
```

| Function              | Signature                                                                                   | Description                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildReport`         | `(batches: readonly StoredBatch[], now?: Date) => Report`                                   | Merges stored batches into the report the CLI and web viewer show. Percentiles come from merged histograms.                                                                             |
| `formatReport`        | `(report: Report, limit?: number) => string`                                                | The terminal version of the report. `limit` defaults to 15 rows per table.                                                                                                              |
| `loadBatchesFromFile` | `(path: string) => Promise<StoredBatch[]>`                                                  | Reads a file in any supported shape: JSON Lines of stored batches, a JSON array of stored batches or payloads, or a single payload. Payloads without `receivedAt` use `session.sentAt`. |
| `parseBatches`        | `(text: string) => StoredBatch[]`                                                           | The same, from a string.                                                                                                                                                                |
| `parseDuration`       | `(text: string) => number \| null`                                                          | Parses `7d`, `24h` or `30m` into milliseconds; `null` when invalid.                                                                                                                     |
| `toBatchQuery`        | `(options: { since?: string \| null; version?: string \| null }, now?: Date) => BatchQuery` | Builds a storage query from a `since` duration and a version. Throws on an invalid duration.                                                                                            |
| `deviceClass`         | `(device: Payload["device"]) => string`                                                     | The device class label, e.g. `"4 GB · 8 cores"`, with `?` for unknown values.                                                                                                           |
| `createViewerServer`  | `(options: ViewerServerOptions) => Server`                                                  | A `node:http` server for the web viewer and its report API. It only reads from storage. Call `.listen()` yourself.                                                                      |

`ViewerServerOptions`:

| Option    | Type      | Description                                                                 |
| --------- | --------- | --------------------------------------------------------------------------- |
| `storage` | `Storage` | Any collector storage, e.g. `postgresStorage({ url, autoMigrate: false })`. |
| `webRoot` | `string`  | Folder with the built web viewer (`dist/web` in the package).               |

Example: a report in a script.

```ts
import { jsonFileStorage } from "react-render-pulse-collector/json-file";
import { buildReport, toBatchQuery } from "react-render-pulse-viewer";

const storage = jsonFileStorage({ path: "./data/render-pulse.jsonl" });
const report = buildReport(await storage.read(toBatchQuery({ since: "7d" })));

for (const area of report.areas.slice(0, 5)) {
  console.log(`${area.id} on ${area.route}: p75 ${area.p75} ms over ${area.renders} renders`);
}
```

## `Report`

Durations are in milliseconds.

| Field          | Type                                           | Description                                                                                       |
| -------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `generatedAt`  | `string`                                       | ISO time the report was built.                                                                    |
| `range`        | `{ from: string \| null; to: string \| null }` | Earliest and latest `receivedAt` in the data.                                                     |
| `batches`      | `number`                                       | Batches included.                                                                                 |
| `sessions`     | `number`                                       | Distinct session ids (page loads).                                                                |
| `totals`       | `GroupSummary`                                 | Everything, with `key` `"all"`.                                                                   |
| `areas`        | `AreaSummary[]`                                | Per area and route, slowest first by p75.                                                         |
| `routes`       | `GroupSummary[]`                               | Per route, slowest first.                                                                         |
| `devices`      | `GroupSummary[]`                               | Per device class (memory · cores), slowest first.                                                 |
| `connections`  | `GroupSummary[]`                               | Per connection type (`"unknown"` when not reported), slowest first.                               |
| `byDay`        | `GroupSummary[]`                               | Per UTC day (`YYYY-MM-DD`) of `receivedAt`, oldest first.                                         |
| `byVersion`    | `GroupSummary[]`                               | Per app version (`"unknown"` when not set), oldest first by when each version was first received. |
| `droppedAreas` | `number`                                       | Area entries left out of batches by the client's limits.                                          |

`Timings`, shared by both summaries:

| Field               | Type     | Description                                                                                  |
| ------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `renders`           | `number` | Renders.                                                                                     |
| `slow`              | `number` | Renders slower than the client's `slowRenderMs`.                                             |
| `slowRate`          | `number` | `slow / renders`, 0 to 1.                                                                    |
| `p50`, `p75`, `p95` | `number` | Percentiles from the merged histogram, kept within the fastest and slowest renders observed. |
| `max`               | `number` | Slowest render.                                                                              |

`AreaSummary` adds `id`, `route`, `sessions`, `mounts`, `longTasks` (long tasks attributed to this area on this route) and `longTaskMaxMs`.

`GroupSummary` adds `key` (the group label), `sessions`, `longTasks` and `longTasksPerSession`. For routes, `longTasks` counts the long tasks observed on that route. Long animation frames aren't counted in `longTasks`.
