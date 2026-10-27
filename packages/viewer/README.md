# react-render-pulse-viewer

[![npm version](https://img.shields.io/npm/v/react-render-pulse-viewer?color=cb3837&logo=npm)](https://www.npmjs.com/package/react-render-pulse-viewer)
[![CI](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml/badge.svg)](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-render-pulse-viewer)](https://github.com/Amalmktk/react-render-pulse/blob/main/LICENSE)

A CLI report and a local web viewer for data collected by [`react-render-pulse`](https://www.npmjs.com/package/react-render-pulse) and stored by [`react-render-pulse-collector`](https://www.npmjs.com/package/react-render-pulse-collector). It shows the slowest areas, routes, device classes and connection types, and trends by day and app version. Read-only. Requires Node 20+.

![The web viewer, showing synthetic demo data](https://raw.githubusercontent.com/Amalmktk/react-render-pulse/main/docs/public/viewer.png)

<sub>The web viewer, showing synthetic demo data.</sub>

## Usage

```bash
# Terminal report from a JSON Lines file (jsonFileStorage) or a JSON export
npx react-render-pulse-viewer report ./data/render-pulse.jsonl

# Terminal report from Postgres, last 7 days, one app version
npx react-render-pulse-viewer report --db "$DATABASE_URL" --since 7d --app-version 2.4.0

# Web viewer on http://127.0.0.1:4173
npx react-render-pulse-viewer serve --db "$DATABASE_URL"
npx react-render-pulse-viewer serve --file ./data/render-pulse.jsonl
```

| Flag | Default | Description |
| --- | --- | --- |
| `--since <duration>` | all time | `report`: only the last `7d`, `24h`, `30m`, ... |
| `--app-version <ver>` | all | `report`: one app version, or `unknown` for none. |
| `--limit <n>` | `15` | `report`: rows per table. |
| `--json` | off | `report`: print the report as JSON. |
| `--table <name>` | `render_pulse_batches` | Postgres table. |
| `--port <n>` | `4173` | `serve`: port. |
| `--host <host>` | `127.0.0.1` | `serve`: interface to bind. |

The web viewer has its own range and app-version filters. Percentiles are computed from merged histograms, never by averaging per-batch percentiles.

## Programmatic use

```ts
import { jsonFileStorage } from "react-render-pulse-collector/json-file";
import { buildReport, toBatchQuery } from "react-render-pulse-viewer";

const storage = jsonFileStorage({ path: "./data/render-pulse.jsonl" });
const report = buildReport(await storage.read(toBatchQuery({ since: "7d" })));
console.log(report.areas.slice(0, 5));
```

Also exported: `formatReport`, `loadBatchesFromFile`, `parseBatches`, `parseDuration`, `deviceClass`, `createViewerServer`.

## Documentation

- [Viewer guide](https://github.com/Amalmktk/react-render-pulse/blob/main/docs/guide/viewer.md): reading reports and acting on findings
- [Viewer API reference](https://github.com/Amalmktk/react-render-pulse/blob/main/docs/api/viewer.md)
- Full docs: https://github.com/Amalmktk/react-render-pulse/tree/main/docs

## License

MIT © Amal M
