#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { filterBatches, type Storage } from "react-render-pulse-collector";
import { loadBatchesFromFile } from "../core/load.js";
import { toBatchQuery } from "../core/query.js";
import { buildReport } from "../core/report.js";
import { createViewerServer } from "../server/server.js";
import { formatReport } from "./printReport.js";

const HELP = `react-render-pulse-viewer

Usage
  react-render-pulse-viewer report <file>         Print a report from a JSON or JSON Lines export
  react-render-pulse-viewer report --db <url>     Print a report from Postgres
  react-render-pulse-viewer serve --db <url>      Open the web viewer on Postgres data
  react-render-pulse-viewer serve --file <file>   Open the web viewer on a file

Options
  --since <duration>     Only batches from the last e.g. 7d, 24h, 30m (report; the web viewer has its own filter)
  --app-version <ver>    Only batches from this app version, or "unknown" for none (report)
  --limit <n>            Rows per table (report, default 15)
  --json                 Print the report as JSON (report)
  --table <name>         Postgres table (default render_pulse_batches)
  --port <n>             Port (serve, default 4173)
  --host <host>          Interface to bind (serve, default 127.0.0.1)
  -h, --help             Show this help
`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      db: { type: "string" },
      file: { type: "string" },
      table: { type: "string" },
      since: { type: "string" },
      "app-version": { type: "string" },
      limit: { type: "string" },
      json: { type: "boolean" },
      port: { type: "string" },
      host: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP);
    return values.help ? 0 : 1;
  }

  // `react-render-pulse-viewer report.json` is shorthand for `report report.json`.
  const [first, ...rest] = positionals;
  const command = first === "report" || first === "serve" ? first : "report";
  const file = values.file ?? (command === first ? rest[0] : first);
  const storage = await openStorage({ db: values.db, file, table: values.table });

  if (command === "serve") {
    const port = Number(values.port ?? 4173);
    const host = values.host ?? "127.0.0.1";
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "web");
    createViewerServer({ storage, webRoot }).listen(port, host, () => {
      process.stdout.write(`render-pulse viewer on http://${host === "0.0.0.0" ? "localhost" : host}:${port}\n`);
    });
    return new Promise(() => {}); // Runs until interrupted.
  }

  // Batches without an app version are labeled "unknown"; storage can't query for that, so it's filtered here.
  const version = values["app-version"];
  const query = toBatchQuery({ since: values.since, version: version === "unknown" ? undefined : version });
  let batches = await storage.read(query);
  if (version === "unknown") batches = batches.filter((b) => b.payload.session.appVersion === null);
  const report = buildReport(batches);
  process.stdout.write(
    values.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatReport(report, Number(values.limit ?? 15))}\n`,
  );
  return 0;
}

async function openStorage(options: {
  db: string | undefined;
  file: string | undefined;
  table: string | undefined;
}): Promise<Storage> {
  if (options.db) {
    const { postgresStorage } = await import("react-render-pulse-collector/postgres");
    return postgresStorage({ url: options.db, table: options.table, autoMigrate: false });
  }
  if (options.file) {
    const path = options.file;
    return {
      write: () => Promise.reject(new Error("The viewer is read-only")),
      // Re-read on every request, so `serve --file` shows new batches without a restart.
      read: async (query) => filterBatches(await loadBatchesFromFile(path), query),
    };
  }
  throw new Error("Pass a file, --file <path>, or --db <url>. See --help.");
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${(error as Error).message ?? String(error)}\n`);
    process.exit(1);
  },
);
