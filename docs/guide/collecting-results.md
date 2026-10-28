# Collecting results

This guide takes you from "the client is installed" to "I know which components to fix": choose where data goes, deploy a collector, check data arrives, then read it with the viewer, SQL or your own code. For how each part works inside, see [Architecture](/guide/architecture).

## 1. Choose where the data goes

| If you have... | Use | Storage |
| --- | --- | --- |
| A Next.js, Remix or Express app | A collector route in the same app (same origin, no CORS) | Postgres |
| A static site or several frontends | A standalone collector on Vercel, Netlify or Cloudflare | Postgres |
| One server with a disk, or a quick local test | A Node collector | JSON Lines file |
| An OpenTelemetry pipeline already | The OpenTelemetry exporter, no collector needed | Your metrics backend |

Any Postgres works: Supabase, Neon, Vercel Postgres, RDS, or your own. The table is created on the first batch.

## 2. Start the client

```bash
npm install react-render-pulse
```

```tsx
// Run once in the browser, before your app renders (e.g. src/main.tsx)
import { initRenderPulse } from "react-render-pulse";

initRenderPulse({
  endpoint: "/api/render-pulse", // or https://collector.example.com/api/render-pulse
  sampleRate: 0.1, // 10% of page loads; use 1 while testing
  appVersion: import.meta.env.VITE_APP_VERSION, // lets you compare releases
  getRoute: () => location.pathname.replace(/\/\d+(?=\/|$)/g, "/:id"), // normalize ids
});
```

Then wrap the areas you care about in `<RenderMonitor id="...">`, or call `useRenderMonitor("...")` inside a component. [Frameworks](/guide/frameworks) shows where `initRenderPulse` goes in Next.js and React Router.

## 3. Deploy a collector

### Same app: Next.js App Router

```bash
npm install react-render-pulse-collector pg
```

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

### Standalone: a Vercel Function

```ts
// api/render-pulse.ts
import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

const collect = createCollector({
  storage: postgresStorage({ url: process.env.DATABASE_URL! }),
  allowedOrigins: ["https://www.example.com"], // your sites; others get 403
});

export const POST = collect;
export const OPTIONS = collect;
```

Point the client at the full URL: `endpoint: "https://<project>.vercel.app/api/render-pulse"`. A complete project is in [examples/collector-vercel](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/collector-vercel). Netlify and Cloudflare Workers are in [Collector and storage](/guide/collector#deploying).

### Node or Express, writing to a file

```ts
import express from "express";
import { createCollector } from "react-render-pulse-collector";
import { jsonFileStorage } from "react-render-pulse-collector/json-file";
import { toNodeListener } from "react-render-pulse-collector/node";

const app = express();
// Before any body parser: the collector reads and size-limits the raw body itself.
app.all("/api/render-pulse", toNodeListener(createCollector({
  storage: jsonFileStorage({ path: "./data/render-pulse.jsonl" }),
})));
app.listen(3000);
```

## 4. Check that data arrives

1. Load your app with `sampleRate: 1`, use it for a bit, then **switch to another tab**. Batches are sent when the page is hidden, and every 3 minutes while it's open.
2. In DevTools → Network, look for a `POST` to your endpoint (the type may show as `ping` for beacons). A `204` means the batch was stored.
3. Look in storage:

```sql
SELECT count(*) AS batches, max(received_at) AS latest FROM render_pulse_batches;
```

```bash
tail -n 1 ./data/render-pulse.jsonl   # the JSON Lines file
```

You can also send a batch on demand. `initRenderPulse` returns an object with `flush()`:

```ts
const pulse = initRenderPulse({ endpoint: "/api/render-pulse" });
// later, e.g. from the DevTools console after exposing it:
pulse.flush(); // returns the payload it sent, or null if nothing was measured
```

If nothing arrives, see [Troubleshooting](#troubleshooting).

## 5. Read the results with the viewer

```bash
# Terminal report: last 7 days from Postgres
npx react-render-pulse-viewer report --db "$DATABASE_URL" --since 7d

# Or from the JSON Lines file
npx react-render-pulse-viewer report ./data/render-pulse.jsonl

# Web viewer on http://127.0.0.1:4173, with range and version filters
npx react-render-pulse-viewer serve --db "$DATABASE_URL"
```

The report starts with totals, then lists:

- **Slowest areas** (area + route) by p75, with p95, max, slow-render rate and long tasks. Fix the top of this list first.
- **Routes**, so you can see which pages are worst overall.
- **Device classes** (memory · cores) and **connections**. A big gap between low-end and high-end devices means CPU-bound render work.
- **App versions**, oldest first. If p75 jumps in a new version, the change shipped there.

[Viewer](/guide/viewer) explains each column and how to act on it.

## 6. Query Postgres directly

Every batch is one row with the full payload in a `jsonb` column, so you can answer your own questions with SQL. Each area in a batch is an element of `payload->'areas'`.

**Sessions, renders and slow renders per day:**

```sql
SELECT date_trunc('day', received_at) AS day,
       count(DISTINCT session_id) AS sessions,
       sum((payload->'summary'->>'renders')::int) AS renders,
       sum((payload->'summary'->>'slowRenders')::int) AS slow_renders
FROM render_pulse_batches
WHERE received_at > now() - interval '30 days'
GROUP BY 1
ORDER BY 1;
```

**Areas with the highest share of slow renders:**

```sql
SELECT a->>'id' AS area,
       a->>'route' AS route,
       sum((a->>'renders')::int) AS renders,
       sum((a->>'slow')::int) AS slow,
       round(100.0 * sum((a->>'slow')::int) / nullif(sum((a->>'renders')::int), 0), 1) AS slow_pct,
       max((a->>'max')::numeric) AS max_ms
FROM render_pulse_batches b
CROSS JOIN LATERAL jsonb_array_elements(b.payload->'areas') AS a
WHERE b.received_at > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY slow_pct DESC NULLS LAST
LIMIT 20;
```

**One area across app versions** (did the release make it slower?):

```sql
SELECT b.app_version,
       min(b.received_at) AS first_seen,
       count(DISTINCT b.session_id) AS sessions,
       sum((a->>'renders')::int) AS renders,
       round(100.0 * sum((a->>'slow')::int) / nullif(sum((a->>'renders')::int), 0), 1) AS slow_pct
FROM render_pulse_batches b
CROSS JOIN LATERAL jsonb_array_elements(b.payload->'areas') AS a
WHERE a->>'id' = 'orders-table'
GROUP BY b.app_version
ORDER BY first_seen;
```

**Long tasks by the area that caused them:**

```sql
SELECT coalesce(t->>'area', '(no area)') AS area,
       t->>'route' AS route,
       sum((t->>'count')::int) AS long_tasks,
       max((t->>'maxMs')::numeric) AS worst_ms
FROM render_pulse_batches b
CROSS JOIN LATERAL jsonb_array_elements(b.payload->'longTasks') AS t
WHERE b.received_at > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY long_tasks DESC;
```

**Slow-render rate by device memory:**

```sql
SELECT coalesce(payload->'device'->>'memoryGb', 'unknown') AS memory_gb,
       count(DISTINCT session_id) AS sessions,
       round(100.0 * sum((payload->'summary'->>'slowRenders')::int)
             / nullif(sum((payload->'summary'->>'renders')::int), 0), 1) AS slow_pct
FROM render_pulse_batches
WHERE received_at > now() - interval '30 days'
GROUP BY 1
ORDER BY slow_pct DESC NULLS LAST;
```

**The merged duration histogram for one area** (bucket upper bounds, in ms: 1, 2, 4, 8, 12, 16, 24, 33, 50, 75, 100, 150, 250, 500, 1000, then everything above):

```sql
SELECT h.bucket,
       sum(h.n::int) AS renders
FROM render_pulse_batches b
CROSS JOIN LATERAL jsonb_array_elements(b.payload->'areas') AS a
CROSS JOIN LATERAL jsonb_array_elements_text(a->'hist') WITH ORDINALITY AS h(n, bucket)
WHERE a->>'id' = 'orders-table'
GROUP BY h.bucket
ORDER BY h.bucket;
```

Don't average the per-batch `p50`/`p75`/`p95` values across rows: that gives wrong percentiles. Merge histograms (as above) or use the viewer, which does this for you.

**Keep the table small.** Delete old batches on a schedule:

```sql
DELETE FROM render_pulse_batches WHERE received_at < now() - interval '90 days';
```

## 7. Use the results in your own code

The viewer's report builder is exported, so you can produce the same numbers in a script, a scheduled job or your own dashboard:

```ts
import { postgresStorage } from "react-render-pulse-collector/postgres";
import { buildReport, formatReport, toBatchQuery } from "react-render-pulse-viewer";

const storage = postgresStorage({ url: process.env.DATABASE_URL!, autoMigrate: false });
const report = buildReport(await storage.read(toBatchQuery({ since: "7d" })));

console.log(formatReport(report)); // the same tables as `report`

// e.g. flag areas whose p75 is over one frame
for (const area of report.areas.filter((a) => a.p75 > 16)) {
  console.log(`${area.id} on ${area.route}: p75 ${area.p75} ms over ${area.renders} renders`);
}

await storage.close();
```

`report` has `totals`, `areas`, `routes`, `devices`, `connections`, `byDay` and `byVersion`. See the [viewer API reference](/api/viewer).

## 8. Or send it to OpenTelemetry

If you already collect OpenTelemetry metrics, record every measurement there, with or without a collector:

```ts
import { metrics } from "@opentelemetry/api";
import { initRenderPulse } from "react-render-pulse";
import { createOtelExporter } from "react-render-pulse/otel";

initRenderPulse({
  sampleRate: 0.1,
  exporters: [createOtelExporter({ meter: metrics.getMeter("my-app") })],
});
```

You get `render_pulse.render.duration` and `render_pulse.longtask.duration` histograms and a `render_pulse.render.slow` counter, with area, route, phase and mode attributes. See [OpenTelemetry](/guide/opentelemetry).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| No request in the Network tab | The session wasn't sampled (check `initRenderPulse(...).sampled`), nothing was measured yet, or you haven't hidden the page and 3 minutes haven't passed. |
| `403` | The page's origin isn't in `allowedOrigins`. Include the scheme and port, e.g. `http://localhost:5173`. |
| `400` with `issues` | The payload doesn't match the collector's schema. Keep the client and collector on the same major version. |
| `413` | A batch is over `maxBodyBytes`. The client trims to 60,000 bytes by default; lower `maxAreas` or raise the collector's limit. |
| `429` | Rate limited (120 requests per minute per client by default). The client retries later. |
| `500` | Storage failed. Pass `onError` to `createCollector` to log the error; check `DATABASE_URL`. |
| An area records its mount but not its updates | Lightweight mode only sees updates that start at the monitor or above. Wrap the component that owns the state, use `useRenderMonitor` inside it, or use profiling mode. See [Modes](/guide/modes). |
| Routes contain ids or names | Pass a `getRoute` that returns route templates (`/orders/:id`). |
