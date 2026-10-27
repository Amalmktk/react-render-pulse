# Collector and storage

`react-render-pulse-collector` is the endpoint the client sends batches to. `createCollector` returns a standard `(request: Request) => Promise<Response>` handler: it accepts `POST`ed batches, validates them against the [payload schema](/guide/what-we-collect), and writes them to a storage adapter.

```bash
npm install react-render-pulse-collector
# for Postgres storage
npm install pg
```

```ts
import { createCollector, memoryStorage } from "react-render-pulse-collector";

const collector = createCollector({ storage: memoryStorage() });
// collector: (request: Request) => Promise<Response>
```

Point the client at wherever you mount it:

```ts
initRenderPulse({ endpoint: "/api/render-pulse" });
```

The endpoint can be on another origin, for example `https://pulse.example.com/collect`. See [CORS](#cors).

## Storage adapters

| Adapter           | Import                                   | Use for                                                                          |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `postgresStorage` | `react-render-pulse-collector/postgres`  | Production, including serverless. Any Postgres: Supabase, Neon, RDS, your own.   |
| `jsonFileStorage` | `react-render-pulse-collector/json-file` | Local development and small sites on a server with a persistent disk. Node only. |
| `memoryStorage`   | `react-render-pulse-collector`           | Tests. Lost on restart.                                                          |

You can also write your own; see [Custom storage](#custom-storage).

### Postgres

```ts
import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

const collector = createCollector({
  storage: postgresStorage({ url: process.env.DATABASE_URL! }),
});
```

With `url`, the adapter loads `pg` on first use and creates a pool of up to 3 connections. To reuse a pool or client you already have, pass it instead; anything with a `query(text, params)` method that returns `{ rows }` works, including `pg`'s `Pool` and `Client`:

```ts
import pg from "pg";
import { postgresStorage } from "react-render-pulse-collector/postgres";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const storage = postgresStorage({ client: pool, table: "render_pulse_batches" });
```

On serverless platforms, use your provider's pooled connection string (for example Supabase's transaction pooler or Neon's pooled endpoint), since each function instance opens its own connections.

#### Table schema

By default the adapter creates the table and indexes the first time it reads or writes (`autoMigrate: true`). The table name defaults to `render_pulse_batches`. This is the SQL it runs:

```sql
CREATE TABLE IF NOT EXISTS render_pulse_batches (
  id BIGSERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id TEXT NOT NULL,
  app_version TEXT,
  route TEXT NOT NULL,
  mode TEXT NOT NULL,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS render_pulse_batches_received_at_idx
  ON render_pulse_batches (received_at DESC);
CREATE INDEX IF NOT EXISTS render_pulse_batches_app_version_idx
  ON render_pulse_batches (app_version, received_at DESC);
```

Each row is one batch. `session_id`, `app_version`, `route` (the route when the batch was built) and `mode` are copied out of the payload for filtering; the whole payload is in `payload`.

If the database user the collector runs as can't create tables, run that SQL yourself (or call `storage.migrate()` once from a script with a privileged connection) and pass `autoMigrate: false`. The table name must be a plain SQL identifier: letters, digits and underscores, starting with a letter or underscore, up to 63 characters.

Data accumulates forever. To keep, say, 90 days, schedule:

```sql
DELETE FROM render_pulse_batches WHERE received_at < now() - interval '90 days';
```

### JSON file

```ts
import { createCollector } from "react-render-pulse-collector";
import { jsonFileStorage } from "react-render-pulse-collector/json-file";

const collector = createCollector({
  storage: jsonFileStorage({ path: "./data/render-pulse.jsonl" }),
});
```

Each batch is appended as one line of JSON (`{ "receivedAt": "...", "payload": { ... } }`). The file and its folder are created on first write, and concurrent writes are queued so lines never interleave. The viewer reads this file directly.

It needs Node's `fs` and a persistent disk, so it doesn't work on Vercel, Netlify or Cloudflare. Use Postgres there.

### Custom storage

A storage adapter is an object with two methods:

```ts
import type { BatchQuery, Storage, StoredBatch } from "react-render-pulse-collector";

interface Storage {
  write: (batch: StoredBatch) => Promise<void>;
  /** Batches matching `query`, newest first. */
  read: (query?: BatchQuery) => Promise<StoredBatch[]>;
}
```

`write` is all the collector uses; `read` is what the viewer uses. If your store can't filter, load the batches and apply the query with `filterBatches(batches, query)`.

## Deploying

The handler only needs the standard `Request` and `Response` classes, so it runs on any platform that provides them. It doesn't look at the URL path, so mount it at whatever path you like.

### Vercel (Next.js)

With the App Router, export the handler as a route handler:

```ts
// app/api/render-pulse/route.ts
import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

const collector = createCollector({
  storage: postgresStorage({ url: process.env.DATABASE_URL! }),
});

export const POST = collector;
export const OPTIONS = collector;
```

Keep the default Node.js runtime: `pg` doesn't run on the Edge runtime.

With the Pages Router, put the same route handler in `app/api/render-pulse/route.ts` (the two routers can coexist), or adapt it to a Pages API route with `toNodeListener`, disabling Next's body parser so the collector can read the raw body:

```ts
// pages/api/render-pulse.ts
import { createCollector } from "react-render-pulse-collector";
import { toNodeListener } from "react-render-pulse-collector/node";
import { postgresStorage } from "react-render-pulse-collector/postgres";

export const config = { api: { bodyParser: false } };

export default toNodeListener(createCollector({ storage: postgresStorage({ url: process.env.DATABASE_URL! }) }));
```

The [App Router](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/next-app-router) and [Pages Router](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/next-pages-router) examples use exactly these files, falling back to `memoryStorage()` when `DATABASE_URL` isn't set so they run without a database.

### Vercel (standalone collector)

To collect from several sites, or from an app that isn't on Vercel, deploy the collector on its own. Vercel Functions accept web-standard handlers as named method exports. This is [examples/collector-vercel](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/collector-vercel):

```ts
// api/render-pulse.ts
import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

// Set DATABASE_URL (e.g. a Supabase or Neon connection string) in the project's
// environment variables. The table is created on the first batch.
const collect = createCollector({
  storage: postgresStorage({ url: process.env.DATABASE_URL ?? "" }),
  // Only your sites can send batches.
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "*") === "*" ? "*" : (process.env.ALLOWED_ORIGINS ?? "").split(","),
  onError: (error) => console.error("render-pulse collector:", error),
});

// Vercel's Web-standard function signature: one handler per HTTP method.
export const POST = collect;
export const OPTIONS = collect;
```

1. Create a Postgres database (Supabase, Neon, or Vercel Postgres) and copy its connection string.
2. Deploy the folder with `vercel deploy`.
3. In the project settings, set `DATABASE_URL`, and `ALLOWED_ORIGINS` to your sites, comma-separated (or `*`).
4. Point your app at it: `initRenderPulse({ endpoint: "https://<project>.vercel.app/api/render-pulse" })`.
5. Read the data: `npx react-render-pulse-viewer serve --db "$DATABASE_URL"`.

### Netlify

Netlify Functions take a web-standard handler as the default export:

```ts
// netlify/functions/render-pulse.ts
import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

export default createCollector({
  storage: postgresStorage({ url: process.env.DATABASE_URL! }),
});

export const config = { path: "/api/render-pulse" };
```

### Cloudflare Workers

Workers pass environment variables to `fetch`, so create the collector on the first request. `jsonFileStorage` isn't available, and a `pg` pool can't be shared across requests in a Worker, so implement `Storage` over a Workers binding. This one uses D1, with a table created by `CREATE TABLE render_pulse_batches (received_at TEXT NOT NULL, app_version TEXT, payload TEXT NOT NULL)`:

```ts
// src/index.ts
import { createCollector, type Storage } from "react-render-pulse-collector";

// The parts of Cloudflare's D1Database used here. With @cloudflare/workers-types, use D1Database.
interface D1Like {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => { run: () => Promise<unknown> };
  };
}

interface Env {
  DB: D1Like;
}

function d1Storage(db: D1Like): Storage {
  return {
    async write(batch) {
      await db
        .prepare("INSERT INTO render_pulse_batches (received_at, app_version, payload) VALUES (?, ?, ?)")
        .bind(batch.receivedAt, batch.payload.session.appVersion, JSON.stringify(batch.payload))
        .run();
    },
    // The collector only writes. To view the data, export the payload column
    // as a JSON array of payloads and run `react-render-pulse-viewer report <file>`.
    async read() {
      throw new Error("d1Storage is write-only");
    },
  };
}

let collector: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    collector ??= createCollector({ storage: d1Storage(env.DB) });
    return collector(request);
  },
};
```

Alternatively, reach Postgres through Cloudflare Hyperdrive with the `nodejs_compat` flag, creating the storage inside `fetch` for each request. The default rate-limit key reads Cloudflare's `cf-connecting-ip` header.

### Node: Express, Connect, node:http

`react-render-pulse-collector/node` exports `toNodeListener(handler)`, which adapts the handler to Node's `(req, res, next?)` signature. It works with `node:http`, Express, Connect, and Vite's dev-server middleware.

```ts
// server.ts
import express from "express";
import { createCollector } from "react-render-pulse-collector";
import { jsonFileStorage } from "react-render-pulse-collector/json-file";
import { toNodeListener } from "react-render-pulse-collector/node";

const collector = createCollector({
  storage: jsonFileStorage({ path: "./data/render-pulse.jsonl" }),
});

const app = express();
// Before any body parser: the collector reads the raw request body itself.
app.all("/api/render-pulse", toNodeListener(collector));
app.use(express.json());

app.listen(3000);
```

With plain `node:http`, every request goes to the collector:

```ts
import { createServer } from "node:http";
import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";
import { toNodeListener } from "react-render-pulse-collector/node";

const collector = createCollector({
  storage: postgresStorage({ url: process.env.DATABASE_URL! }),
});

createServer(toNodeListener(collector)).listen(3001);
```

If the handler itself throws, the listener passes the error to `next` when there is one (Express's error handling), and otherwise responds with a bare 500. Storage errors don't throw; they become a 500 response with a JSON body.

The handler runs on any Node 18+ runtime. Deno and Bun can pass it directly to `Deno.serve` and `Bun.serve({ fetch })`.

When a request has neither `x-forwarded-for` nor `x-real-ip`, `toNodeListener` passes the socket's remote address on as `x-real-ip`, so a Node server facing clients directly is still rate limited per client. Behind a reverse proxy, the proxy's `x-forwarded-for` is used instead.

## Rate limits

By default each client may send 120 requests a minute. Batches go out roughly every 3 minutes and when the page is hidden, so real clients stay far below that.

```ts
createCollector({
  storage,
  rateLimit: { windowMs: 60_000, max: 120 }, // the defaults
});

createCollector({ storage, rateLimit: false }); // off
```

The limiter is a fixed window held in memory. On serverless platforms each instance keeps its own counts, so it limits bursts per instance rather than globally; for strict limits, add your platform's rate limiting in front.

Clients are keyed by IP from standard proxy headers: the first address in `x-forwarded-for`, then `cf-connecting-ip`, then `x-real-ip`. The IP is only held in memory for the window and never stored. Requests with none of these headers aren't limited (with `toNodeListener`, the socket address fills in `x-real-ip`; see [Node](#node-express-connect-node-http)). To key differently, pass `getClientKey`; return `null` to skip limiting a request:

```ts
createCollector({
  storage,
  getClientKey: (request) => request.headers.get("x-vercel-forwarded-for") ?? null,
});
```

Only trust `x-forwarded-for` when a proxy you control sets it; otherwise clients can choose their own key.

## CORS

By default any origin may send batches, and responses carry `access-control-allow-origin: *`. Batches carry no credentials, so this is safe. To accept batches only from your own sites:

```ts
createCollector({
  storage,
  allowedOrigins: ["https://app.example.com", "https://www.example.com"],
});
```

With a list:

- A `POST` whose `Origin` header is listed is accepted, and the response echoes that origin in `access-control-allow-origin` (with `vary: Origin`).
- A `POST` whose `Origin` header isn't listed gets `403` and isn't stored. CORS headers alone wouldn't be enough, because browsers send these `text/plain` requests without a preflight.
- A request with no `Origin` header, such as one from a server-side sender, is allowed. Browsers always send `Origin` on cross-origin `POST`s, so this doesn't open a gap for other websites; it does mean `allowedOrigins` isn't authentication against scripts outside a browser.

`OPTIONS` preflights are answered with `204`, allowing `POST, OPTIONS` and the `content-type` header, cached for a day.

The client sends batches as a plain string body, which browsers send as `text/plain`, a CORS-safelisted type. `sendBeacon` and `fetch` therefore never need a preflight, even cross-origin.

## Body size

Requests larger than `maxBodyBytes` (65,536 bytes by default) are rejected with 413, checked against `content-length` and again while reading, so a missing or wrong header doesn't get around it. The client trims batches to `maxPayloadBytes` (60,000 by default) before sending, dropping worst-case lists first and then the areas with the fewest renders.

## Response codes

| Status | When                                                              | Body                                                                                                                                                                             |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `204`  | Batch stored, or an `OPTIONS` preflight                           | none                                                                                                                                                                             |
| `400`  | Body unreadable, not JSON, or not a valid payload                 | `{ "error": "Unreadable body" }`, `{ "error": "Invalid JSON" }`, or `{ "error": "Invalid payload", "issues": [{ "path": "areas.0.hist", "message": "..." }] }` (up to 10 issues) |
| `403`  | `allowedOrigins` is a list and the request's `Origin` isn't on it | `{ "error": "Origin not allowed" }`                                                                                                                                              |
| `405`  | Any method other than `POST` or `OPTIONS`                         | `{ "error": "Method not allowed" }`, with `allow: POST, OPTIONS`                                                                                                                 |
| `413`  | Body larger than `maxBodyBytes`                                   | `{ "error": "Payload too large" }`                                                                                                                                               |
| `429`  | Rate limited                                                      | `{ "error": "Too many requests" }`, with `retry-after` in seconds                                                                                                                |
| `500`  | Storage threw                                                     | `{ "error": "Storage failed" }`; the error goes to `onError`                                                                                                                     |

The client retries only `429`, `5xx` and network errors, on later flushes, up to 3 attempts per batch, keeping at most 5 failed batches. A `4xx` other than `429` means the batch is invalid, so retrying wouldn't help.

To log storage failures:

```ts
createCollector({
  storage,
  onError: (error) => console.error("render-pulse storage failed", error),
});
```
