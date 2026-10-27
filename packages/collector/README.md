# react-render-pulse-collector

[![npm version](https://img.shields.io/npm/v/react-render-pulse-collector?color=cb3837&logo=npm)](https://www.npmjs.com/package/react-render-pulse-collector)
[![CI](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml/badge.svg)](https://github.com/Amalmktk/react-render-pulse/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-render-pulse-collector)](https://github.com/Amalmktk/react-render-pulse/blob/main/LICENSE)

The endpoint for [`react-render-pulse`](https://www.npmjs.com/package/react-render-pulse) batches. `createCollector` returns a standard `(request: Request) => Promise<Response>` handler that validates each batch with a strict schema, rate limits clients, and writes to Postgres, a JSON Lines file, or your own storage. It runs on Vercel, Netlify, Cloudflare Workers, Deno, Bun and Node 18+.

## Install

```bash
npm install react-render-pulse-collector
npm install pg   # for Postgres storage
```

## Usage

Next.js App Router (`app/api/render-pulse/route.ts`), or a Vercel Function (`api/render-pulse.ts`):

```ts
import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

const collect = createCollector({
  storage: postgresStorage({ url: process.env.DATABASE_URL! }),
  allowedOrigins: ["https://app.example.com"],
});

export const POST = collect;
export const OPTIONS = collect;
```

The `render_pulse_batches` table is created on first use.

Node, Express, or Pages Router API routes (`(req, res)` handlers):

```ts
import { createCollector } from "react-render-pulse-collector";
import { jsonFileStorage } from "react-render-pulse-collector/json-file";
import { toNodeListener } from "react-render-pulse-collector/node";

const listener = toNodeListener(
  createCollector({ storage: jsonFileStorage({ path: "./data/render-pulse.jsonl" }) }),
);
// app.all("/api/render-pulse", listener)  (before any body parser)
// createServer(listener).listen(3001)
```

Then point the client at it: `initRenderPulse({ endpoint: "/api/render-pulse" })`.

## Entry points

| Import | Exports |
| --- | --- |
| `react-render-pulse-collector` | `createCollector`, `memoryStorage`, `filterBatches`, `createRateLimiter`, `payloadSchema`, types |
| `react-render-pulse-collector/postgres` | `postgresStorage({ url, table?, autoMigrate? })`, or pass `client` (a `pg` pool or client) instead of `url` |
| `react-render-pulse-collector/json-file` | `jsonFileStorage({ path })`, `readJsonLines` (Node only) |
| `react-render-pulse-collector/node` | `toNodeListener(handler)` (Node only) |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `storage` | required | Where batches are written. |
| `maxBodyBytes` | `65536` | Larger requests get 413. |
| `rateLimit` | 120 requests a minute per client | `{ windowMs, max }`, or `false`. In memory, per instance. |
| `getClientKey` | client IP from proxy headers | The rate-limit key. Never stored. |
| `allowedOrigins` | `"*"` | With a list, POSTs from other origins get 403. |
| `onError` | none | Called with storage errors. |

Responses: `204` stored, `400` invalid, `403` origin not allowed, `405` wrong method, `413` too large, `429` rate limited, `500` storage failed. The client retries only `429` and `5xx`.

## Documentation

- [Collector and storage guide](https://github.com/Amalmktk/react-render-pulse/blob/main/docs/guide/collector.md): Vercel, Netlify, Cloudflare Workers, Node, Postgres schema, CORS
- [Collector API reference](https://github.com/Amalmktk/react-render-pulse/blob/main/docs/api/collector.md)
- Full docs: https://github.com/Amalmktk/react-render-pulse/tree/main/docs

## License

MIT © Amal M
