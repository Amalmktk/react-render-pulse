# react-render-pulse-viewer

[![npm version](https://img.shields.io/npm/v/react-render-pulse-viewer?color=cb3837&logo=npm)](https://www.npmjs.com/package/react-render-pulse-viewer)
[![CI](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml/badge.svg)](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-render-pulse-viewer)](https://github.com/Amalmktk/react-render-pulse/blob/main/LICENSE)

Reports for data collected by [`react-render-pulse`](https://www.npmjs.com/package/react-render-pulse) (the real-user render performance monitor for React) and stored by [`react-render-pulse-collector`](https://www.npmjs.com/package/react-render-pulse-collector). It shows which areas render slowest, on which routes, device classes and connections, and how that changes by day and app version, as a terminal report or a local web viewer.

Read-only. Requires Node 20+.

![The web viewer: summary tiles, p75 render time by day and by app version, and the slowest areas](https://raw.githubusercontent.com/Amalmktk/react-render-pulse/main/docs/public/viewer.png)

<sub>The web viewer, showing synthetic demo data.</sub>

📖 **Docs:** https://amalmktk.github.io/react-render-pulse/guide/viewer

## Usage

No install needed:

```bash
# Terminal report from Postgres (what postgresStorage writes)
npx react-render-pulse-viewer report --db "$DATABASE_URL"
npx react-render-pulse-viewer report --db "$DATABASE_URL" --since 7d --app-version 2.4.0

# Terminal report from a JSON Lines file (what jsonFileStorage writes) or a JSON export
npx react-render-pulse-viewer report ./data/render-pulse.jsonl
npx react-render-pulse-viewer ./data/render-pulse.jsonl          # shorthand for `report`

# Web viewer on http://127.0.0.1:4173
npx react-render-pulse-viewer serve --db "$DATABASE_URL"
npx react-render-pulse-viewer serve --file ./data/render-pulse.jsonl
```

Files can be JSON Lines of stored batches, a JSON array of stored batches or payloads, or a single payload. With `--file`, the web viewer re-reads the file on every request, so new batches show up without a restart.

### Flags

| Flag | Default | Description |
| --- | --- | --- |
| `--db <url>` | — | Read from Postgres. |
| `--file <path>` | — | Read from a file. For `report`, the path can also be the first argument. |
| `--table <name>` | `render_pulse_batches` | Postgres table. |
| `--since <duration>` | all time | `report`: only the last `7d`, `24h`, `30m`, ... |
| `--app-version <ver>` | all | `report`: one app version, or `unknown` for batches without one. |
| `--limit <n>` | `15` | `report`: rows per table. |
| `--json` | off | `report`: print the report as JSON. |
| `--port <n>` | `4173` | `serve`: port. |
| `--host <host>` | `127.0.0.1` | `serve`: interface. The viewer has no login; only bind beyond localhost on a trusted network. |

## What the report shows

```
render-pulse report · 2026-10-13 → 2026-10-27

560 sessions · 73,651 renders · 15.8% slow · p75 11.8 ms · 1.04 long tasks/session

Slowest areas (by p75)
area           route        renders   slow  p50 ms  p75 ms  p95 ms  max ms  long tasks
─────────────  ───────────  ───────  ─────  ──────  ──────  ──────  ──────  ──────────
orders-table   /orders       14,628  49.3%    15.8    25.8    55.2   261.5         580
price-chart    /orders/:id   14,661  17.2%     8.5    13.6    26.6   118.4           0
...
```

Then **routes**, **device classes** (memory · cores), **connections**, and **app versions** (oldest first). How to read it:

- **Slowest areas** is your to-do list: start at the top. A high p95 with a low p50 means occasional slow renders (a heavy update path); a high p50 means every render is expensive.
- **Devices:** a big gap between low-memory and high-end devices points to CPU-bound render work, often invisible on a developer laptop.
- **App versions:** if p75 jumps in a release, the regression shipped in it. Use `--app-version` to look at one release.

The web viewer shows the same data with range and app-version filters, p75 trends by day and by version, and the tables. Percentiles are computed from merged histograms across batches, never by averaging per-batch percentiles.

To try it without real data, generate synthetic batches from the repository: `node packages/viewer/scripts/demo-data.mjs demo.jsonl`, then `npx react-render-pulse-viewer serve --file demo.jsonl`.

## Programmatic use

The same report in your own code, for example a weekly summary job:

```ts
import { postgresStorage } from "react-render-pulse-collector/postgres";
import { buildReport, formatReport, toBatchQuery } from "react-render-pulse-viewer";

const storage = postgresStorage({ url: process.env.DATABASE_URL!, autoMigrate: false });
const report = buildReport(await storage.read(toBatchQuery({ since: "7d" })));

console.log(formatReport(report)); // the terminal tables
const overBudget = report.areas.filter((a) => a.p75 > 16); // areas slower than one frame at p75

await storage.close();
```

A `Report` has `totals`, `areas`, `routes`, `devices`, `connections`, `byDay`, `byVersion`, `sessions`, `batches`, `range` and `droppedAreas`.

| Export | Description |
| --- | --- |
| `buildReport(batches)` | Stored batches → `Report`. |
| `formatReport(report, limit?)` | `Report` → the terminal tables as a string. |
| `toBatchQuery({ since?, version? })` | `"7d"` and a version → a storage query. |
| `loadBatchesFromFile(path)`, `parseBatches(text)` | Read JSON Lines, JSON arrays or single payloads. |
| `parseDuration("7d")` | → milliseconds. |
| `deviceClass(device)` | → `"4 GB · 8 cores"`. |
| `createViewerServer({ storage, webRoot })` | The `serve` HTTP server, with `GET /api/report?since=30d&version=2.4.0`. |

## License

MIT © Amal M
