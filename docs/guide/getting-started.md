# Getting started

react-render-pulse has three packages:

| Package                        | What it does                                             |
| ------------------------------ | -------------------------------------------------------- |
| `react-render-pulse`           | The browser client: measures renders and sends batches.  |
| `react-render-pulse-collector` | An HTTP endpoint that validates batches and stores them. |
| `react-render-pulse-viewer`    | A CLI and a local web viewer for the stored data.        |

You only need the client to start. Without an endpoint it logs each batch to the console.

## Install

```bash
npm install react-render-pulse
```

React 18 or 19 is a peer dependency. The client has no other runtime dependencies.

## Start it once

Call `initRenderPulse` once, in the browser, before your app renders:

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initRenderPulse } from "react-render-pulse";
import { App } from "./App";

initRenderPulse({
  endpoint: "/api/render-pulse", // leave out to log batches to the console
  sampleRate: 0.1, // 10% of page loads collect data
  appVersion: import.meta.env.VITE_APP_VERSION,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

On the server `initRenderPulse` does nothing, so it's safe in code that also runs during SSR. Calling it again replaces the previous setup. Every option is listed in the [client API reference](/api/client#initrenderpulse-options).

The sampling decision is made once per page load. Sessions that aren't sampled measure and send nothing.

## Add your first monitor

Wrap a part of the tree you want timings for in `<RenderMonitor>` and give it an id:

```tsx
import { RenderMonitor } from "react-render-pulse";
import { Filters } from "./Filters";
import { OrdersTable } from "./OrdersTable";

export function OrdersPage() {
  return (
    <>
      <Filters />
      <RenderMonitor id="orders-table">
        <OrdersTable />
      </RenderMonitor>
    </>
  );
}
```

`<RenderMonitor>` renders its children as they are. It doesn't add DOM elements and never remounts its children, whatever the mode or sampling decision.

To track a single component without wrapping it, call the hook inside it:

```tsx
import { useRenderMonitor } from "react-render-pulse";

export function PriceChart({ prices }: { prices: number[] }) {
  useRenderMonitor("price-chart");
  return <svg>{/* ... */}</svg>;
}
```

The hook's render count is exact, but its duration is an upper bound. See [Modes](/guide/modes#the-hook-s-duration-is-an-upper-bound).

[Choosing areas](/guide/choosing-areas) covers where monitors give useful results.

## Check it locally

Leave `endpoint` out, load the page, use it, then switch to another tab. When the page is hidden, the client builds a batch and the console exporter logs it as a table, slowest areas first:

```
[render-pulse] batch 1 (lightweight): 48 renders, 2 long tasks
```

You can also send a batch on demand from the object `initRenderPulse` returns:

```ts
const pulse = initRenderPulse();
// later, e.g. from the devtools console
pulse.flush(); // returns the Payload, or null when nothing was measured
```

## Send data to a collector

The collector is a standard `Request` → `Response` handler. On Next.js, for example:

```bash
npm install react-render-pulse-collector pg
```

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

For local testing, store batches in a JSON Lines file instead:

```ts
import { createCollector } from "react-render-pulse-collector";
import { jsonFileStorage } from "react-render-pulse-collector/json-file";

const collector = createCollector({
  storage: jsonFileStorage({ path: "./data/render-pulse.jsonl" }),
});
```

[Collector and storage](/guide/collector) covers Vercel, Netlify, Cloudflare Workers and Node, plus rate limits and CORS.

## View the results

The viewer reads the same storage:

```bash
# A terminal report from the JSON Lines file
npx react-render-pulse-viewer report ./data/render-pulse.jsonl

# A terminal report from Postgres, last 7 days
npx react-render-pulse-viewer report --db "$DATABASE_URL" --since 7d

# The web viewer on http://127.0.0.1:4173
npx react-render-pulse-viewer serve --db "$DATABASE_URL"
```

The report lists the slowest areas by p75, then routes, device classes and connection types. [Viewer](/guide/viewer) explains how to read it.
