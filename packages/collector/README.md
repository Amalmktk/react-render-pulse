# react-render-pulse-collector

[![npm version](https://img.shields.io/npm/v/react-render-pulse-collector?color=cb3837&logo=npm)](https://www.npmjs.com/package/react-render-pulse-collector)
[![CI](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml/badge.svg)](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-render-pulse-collector)](https://github.com/Amalmktk/react-render-pulse/blob/main/LICENSE)

The endpoint that receives and stores batches from [`react-render-pulse`](https://www.npmjs.com/package/react-render-pulse), the real-user render performance monitor for React.

`createCollector()` returns a standard `(request: Request) => Promise<Response>` handler. It validates every batch against a strict schema, rate limits clients, checks origins, and writes to Postgres, a JSON Lines file, memory, or your own storage. It runs anywhere `Request`/`Response` exist: Vercel, Netlify, Cloudflare Workers, Deno, Bun and Node 18+ (Express and `node:http` through `toNodeListener`).

📖 **Docs:** https://amalmktk.github.io/react-render-pulse/guide/collector

## Install

```bash
npm install react-render-pulse-collector
npm install pg   # only for Postgres storage
```

## How a request is handled

```
POST /api/render-pulse  (text/plain JSON, sent by sendBeacon or fetch keepalive)
  │
  ├─ OPTIONS?                         → 204 CORS preflight
  ├─ not POST?                        → 405
  ├─ Origin not in allowedOrigins?    → 403
  ├─ over the rate limit?             → 429 + Retry-After
  ├─ body over maxBodyBytes?          → 413   (checked by header and while reading)
  ├─ not JSON?                        → 400
  ├─ fails the schema?                → 400 + the first issues
  ├─ storage.write() throws?          → 500   (onError is called)
  └─ stored                           → 204
```

The schema bounds every field and rejects unknown ones, so nothing outside the documented payload is ever stored. The client retries only `429` and `5xx`.

## Deploy

The handler doesn't look at the URL path, so mount it wherever you like. The client sends to whatever `endpoint` you give `initRenderPulse`.

### Next.js App Router (same app as the frontend)

```ts
// app/api/render-pulse/route.ts
import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

const collect = createCollector({
  storage: postgresStorage({ url: process.env.DATABASE_URL! }),
});

export const POST = collect;
export const OPTIONS = collect;
```

Keep the default Node.js runtime: `pg` doesn't run on the Edge runtime.

### Next.js Pages Router

```ts
// pages/api/render-pulse.ts
import { createCollector } from "react-render-pulse-collector";
import { toNodeListener } from "react-render-pulse-collector/node";
import { postgresStorage } from "react-render-pulse-collector/postgres";

export const config = { api: { bodyParser: false } }; // the collector reads the raw body

export default toNodeListener(createCollector({ storage: postgresStorage({ url: process.env.DATABASE_URL! }) }));
```

### Standalone on Vercel (for several sites, or a non-Vercel frontend)

```ts
// api/render-pulse.ts
import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

const collect = createCollector({
  storage: postgresStorage({ url: process.env.DATABASE_URL! }),
  allowedOrigins: ["https://www.example.com"], // your sites
  onError: (error) => console.error("render-pulse collector:", error),
});

export const POST = collect;
export const OPTIONS = collect;
```

Then use the full URL in the client: `initRenderPulse({ endpoint: "https://<project>.vercel.app/api/render-pulse" })`. A complete project is in [examples/collector-vercel](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/collector-vercel).

### Netlify

```ts
// netlify/functions/render-pulse.ts
import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

export default createCollector({ storage: postgresStorage({ url: process.env.DATABASE_URL! }) });

export const config = { path: "/api/render-pulse" };
```

### Express or plain Node

```ts
import express from "express";
import { createCollector } from "react-render-pulse-collector";
import { jsonFileStorage } from "react-render-pulse-collector/json-file";
import { toNodeListener } from "react-render-pulse-collector/node";

const app = express();
// Mount before any body parser: the collector reads and size-limits the raw body.
app.all(
  "/api/render-pulse",
  toNodeListener(createCollector({ storage: jsonFileStorage({ path: "./data/render-pulse.jsonl" }) })),
);
app.listen(3000);

// Or without Express: createServer(toNodeListener(handler)).listen(3001)
```

Cloudflare Workers (with a D1 storage adapter) are covered in the [collector guide](https://amalmktk.github.io/react-render-pulse/guide/collector#cloudflare-workers).

## Storage

### Postgres: `react-render-pulse-collector/postgres`

```ts
postgresStorage({ url: process.env.DATABASE_URL! }); // creates a pg Pool (install `pg`)
postgresStorage({ client: myPgPool, table: "render_pulse_batches", autoMigrate: true });
```

| Option | Default | Description |
| --- | --- | --- |
| `url` or `client` | required | A connection string, or an existing `pg` `Pool`/`Client` (anything with `query(text, params)`). |
| `table` | `render_pulse_batches` | Table name. |
| `autoMigrate` | `true` | Create the table and indexes on first use. |

It also has `migrate()` and `close()`. The table, with one row per batch:

```sql
CREATE TABLE IF NOT EXISTS render_pulse_batches (
  id          BIGSERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id  TEXT NOT NULL,
  app_version TEXT,
  route       TEXT NOT NULL,
  mode        TEXT NOT NULL,
  payload     JSONB NOT NULL
);
```

Works with Supabase, Neon, Vercel Postgres, RDS, or any Postgres.

### JSON Lines file: `react-render-pulse-collector/json-file`

`jsonFileStorage({ path })` appends one `{ "receivedAt": "...", "payload": {...} }` per line, creating the file and folder on first write. It needs Node and a persistent disk, so use it for local work and single servers, not serverless. `readJsonLines(path)` reads it back.

### Memory

`memoryStorage()` keeps batches in the process (`.batches`). For tests and demos.

### Your own

```ts
import type { BatchQuery, Storage, StoredBatch } from "react-render-pulse-collector";

const myStorage: Storage = {
  async write(batch: StoredBatch) { /* insert batch.receivedAt + batch.payload */ },
  async read(query?: BatchQuery) { /* newest first; filterBatches(all, query) can filter in memory */ return []; },
};
```

The collector only calls `write`; the viewer calls `read`.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `storage` | required | Where batches are written. |
| `maxBodyBytes` | `65536` | Larger requests get `413`. |
| `rateLimit` | `{ windowMs: 60000, max: 120 }` | Per-client limit, in memory and per instance. `false` turns it off. |
| `getClientKey` | client IP from `x-forwarded-for`, `cf-connecting-ip`, `x-real-ip` | The rate-limit key. Held in memory for the window, never stored. Return `null` to skip limiting. |
| `allowedOrigins` | `"*"` | With a list, browser `POST`s from other origins get `403`. Requests without an `Origin` header are allowed. |
| `onError` | — | Called with storage errors, e.g. to log them. |

## Entry points

| Import | Exports |
| --- | --- |
| `react-render-pulse-collector` | `createCollector`, `memoryStorage`, `filterBatches`, `createRateLimiter`, `payloadSchema`, `payloadV1Schema`, and types (`Storage`, `StoredBatch`, `BatchQuery`, `CollectorOptions`, `CollectorHandler`, ...) |
| `react-render-pulse-collector/postgres` | `postgresStorage` |
| `react-render-pulse-collector/json-file` | `jsonFileStorage`, `readJsonLines` (Node only) |
| `react-render-pulse-collector/node` | `toNodeListener` (Node only) |

## Reading the data

- **Viewer:** `npx react-render-pulse-viewer report --db "$DATABASE_URL"` or `serve --db "$DATABASE_URL"` ([`react-render-pulse-viewer`](https://www.npmjs.com/package/react-render-pulse-viewer)).
- **SQL:** the payload is `jsonb`, so `jsonb_array_elements(payload->'areas')` gives one row per area. Ready-made queries for slowest areas, release comparisons, long tasks and devices: [Collecting results](https://amalmktk.github.io/react-render-pulse/guide/collecting-results#_6-query-postgres-directly).
- **Retention:** `DELETE FROM render_pulse_batches WHERE received_at < now() - interval '90 days';`

## License

MIT © Amal M
