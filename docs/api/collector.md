# react-render-pulse-collector

The collector endpoint and storage adapters. See the [collector guide](/guide/collector) for deployment.

| Entry                                    | Exports                                                                                                             | Runtime                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `react-render-pulse-collector`           | `createCollector`, `memoryStorage`, `filterBatches`, `createRateLimiter`, `payloadSchema`, `payloadV1Schema`, types | Any with `Request`/`Response`                          |
| `react-render-pulse-collector/postgres`  | `postgresStorage`                                                                                                   | Node (needs the `pg` peer dependency when using `url`) |
| `react-render-pulse-collector/json-file` | `jsonFileStorage`, `readJsonLines`                                                                                  | Node                                                   |
| `react-render-pulse-collector/node`      | `toNodeListener`                                                                                                    | Node                                                   |

## `createCollector(options)`

```ts
function createCollector(options: CollectorOptions): CollectorHandler;

type CollectorHandler = (request: Request) => Promise<Response>;
```

Accepts `POST`ed batches, validates them with `payloadSchema`, and writes them to `storage` as `{ receivedAt, payload }`.

| Option           | Type                                   | Default                                                                                             | Description                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`        | `Storage`                              | required                                                                                            | Where batches are written.                                                                                                                                                                                                        |
| `maxBodyBytes`   | `number`                               | `65536`                                                                                             | Largest accepted body in bytes. The client sends at most 60000 by default.                                                                                                                                                        |
| `rateLimit`      | `RateLimitOptions \| false`            | `{ windowMs: 60000, max: 120 }`                                                                     | Per-client request limit, or `false` to turn it off.                                                                                                                                                                              |
| `getClientKey`   | `(request: Request) => string \| null` | First IP in `x-forwarded-for`, else `cf-connecting-ip`, else `x-real-ip`, else `null` (not limited) | The key requests are rate limited by. Held in memory for the window only, never stored. Return `null` to skip limiting a request.                                                                                                 |
| `allowedOrigins` | `string[] \| "*"`                      | `"*"`                                                                                               | Origins allowed to send batches. With a list, a `POST` whose `Origin` isn't listed gets `403`; requests without an `Origin` header (server-side senders) are allowed. Listed origins are echoed in `access-control-allow-origin`. |
| `onError`        | `(error: unknown) => void`             | none                                                                                                | Called with storage errors.                                                                                                                                                                                                       |

### Responses

| Status | Meaning                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------- |
| `204`  | Stored, or `OPTIONS` preflight answered.                                                              |
| `400`  | Unreadable body, invalid JSON, or invalid payload (with up to 10 `issues`, each `{ path, message }`). |
| `403`  | `Origin` not in `allowedOrigins`.                                                                     |
| `405`  | Method other than `POST` or `OPTIONS`.                                                                |
| `413`  | Body larger than `maxBodyBytes`.                                                                      |
| `429`  | Rate limited; `retry-after` header in seconds.                                                        |
| `500`  | Storage failed.                                                                                       |

Error responses have a JSON body `{ "error": string }`. The client retries only `429` and `5xx`.

## Storage

```ts
interface Storage {
  write: (batch: StoredBatch) => Promise<void>;
  /** Batches matching `query`, newest first. */
  read: (query?: BatchQuery) => Promise<StoredBatch[]>;
}

interface StoredBatch {
  /** ISO 8601. */
  receivedAt: string;
  payload: Payload;
}

interface BatchQuery {
  /** Only batches received at or after this time. */
  since?: Date;
  /** Only batches received before this time. */
  until?: Date;
  appVersion?: string;
  /** Most batches returned, newest first. */
  limit?: number;
}
```

### `memoryStorage()`

```ts
function memoryStorage(): Storage & { batches: StoredBatch[] };
```

Keeps batches in an array, for tests and local development. Lost on restart.

### `postgresStorage(options)`

```ts
import { postgresStorage } from "react-render-pulse-collector/postgres";

function postgresStorage(options: PostgresStorageOptions): PostgresStorage;
```

| Option        | Type        | Default                  | Description                                                                                                                               |
| ------------- | ----------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `url`         | `string`    |                          | A connection string, e.g. `process.env.DATABASE_URL`. Needs `pg` installed; creates a pool of up to 3 connections. Pass this or `client`. |
| `client`      | `SqlClient` |                          | An existing client or pool: anything with `query(text, params?) => Promise<{ rows }>`, such as `pg`'s `Pool` or `Client`.                 |
| `table`       | `string`    | `"render_pulse_batches"` | Table name. Letters, digits and underscores, up to 63 characters; anything else throws.                                                   |
| `autoMigrate` | `boolean`   | `true`                   | Creates the table and indexes on first use if they're missing.                                                                            |

`PostgresStorage` adds:

| Member      | Description                                                                  |
| ----------- | ---------------------------------------------------------------------------- |
| `migrate()` | Creates the table and indexes if they don't exist. Safe to run repeatedly.   |
| `close()`   | Closes the pool created from `url`. Does nothing for a client you passed in. |

The table schema is in the [collector guide](/guide/collector#table-schema).

### `jsonFileStorage(options)`

```ts
import { jsonFileStorage } from "react-render-pulse-collector/json-file";

function jsonFileStorage(options: JsonFileStorageOptions): Storage;
```

| Option | Type     | Description                                                                             |
| ------ | -------- | --------------------------------------------------------------------------------------- |
| `path` | `string` | A JSON Lines file, one stored batch per line. Created, with its folder, on first write. |

Writes are queued so lines never interleave. For local use and servers with a persistent disk.

### `readJsonLines(path)`

```ts
function readJsonLines(path: string): Promise<StoredBatch[]>;
```

Reads a JSON Lines file of stored batches, skipping blank or corrupt lines. A missing file reads as empty.

### `filterBatches(batches, query?)`

```ts
function filterBatches(batches: readonly StoredBatch[], query?: BatchQuery): StoredBatch[];
```

Applies a `BatchQuery` in memory and sorts newest first, for adapters that can't filter at the source.

## `toNodeListener(handler)`

```ts
import { toNodeListener } from "react-render-pulse-collector/node";

function toNodeListener(handler: CollectorHandler): NodeListener;

type NodeListener = (req: IncomingMessage, res: ServerResponse, next?: (error?: unknown) => void) => void;
```

Adapts the handler to Node's `(req, res, next?)` signature, for `node:http`, Express, Connect, or Vite middleware. It reads the whole request body, builds a `Request`, and writes the `Response`'s status, headers and body back. If the handler throws, the error goes to `next` when given, otherwise the response is a bare `500`. Mount it before any body-parsing middleware.

When the request has neither `x-forwarded-for` nor `x-real-ip`, the socket's remote address is passed on as `x-real-ip`, so the default `getClientKey` rate limits direct clients too.

## `createRateLimiter(options?)`

```ts
function createRateLimiter(options?: RateLimitOptions): RateLimiter;

interface RateLimitOptions {
  /** Window length in milliseconds. Defaults to 60000. */
  windowMs?: number;
  /** Requests allowed per key per window. Defaults to 120. */
  max?: number;
}

interface RateLimiter {
  /** Returns 0 when allowed, or the seconds until the key's window resets. */
  hit: (key: string, now?: number) => number;
}
```

The fixed-window, in-memory limiter `createCollector` uses. On serverless platforms each instance has its own counts.

## `payloadSchema`, `payloadV1Schema`

Zod schemas for incoming payloads. `payloadSchema` is a discriminated union on `v` of every payload version the collector accepts (currently only version 1); `payloadV1Schema` is version 1. Every object is strict, so unknown fields are rejected. The limits are listed in [What we collect](/guide/what-we-collect#limits-the-collector-enforces).

```ts
import { payloadSchema, type ValidatedPayload } from "react-render-pulse-collector";

const result = payloadSchema.safeParse(json);
if (result.success) {
  const payload: ValidatedPayload = result.data;
}
```

## Types

| Type                                                     | Description                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `CollectorOptions`, `CollectorHandler`                   | See `createCollector`.                                                        |
| `Storage`, `StoredBatch`, `BatchQuery`                   | See [Storage](#storage).                                                      |
| `RateLimitOptions`, `RateLimiter`                        | See `createRateLimiter`.                                                      |
| `ValidatedPayload`                                       | The output type of `payloadSchema`, the same shape as the client's `Payload`. |
| `PostgresStorage`, `PostgresStorageOptions`, `SqlClient` | From `/postgres`.                                                             |
| `JsonFileStorageOptions`                                 | From `/json-file`.                                                            |
| `NodeListener`                                           | From `/node`.                                                                 |
