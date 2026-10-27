# Frameworks

The rules are the same everywhere:

- Call `initRenderPulse` once, **in the browser**, as early as possible. It does nothing on the server, so code that also runs during SSR is safe. Renders that happen before it's called aren't measured, but monitors keep working and start measuring once it is.
- `<RenderMonitor>` and `useRenderMonitor` work in any client component.
- The main `react-render-pulse` entry is marked `"use client"`. Types and `HISTOGRAM_BOUNDS` are also available from `react-render-pulse/core`, which has no React code and is safe in Server Components and route handlers.
- Report route templates, not raw paths, with `getRoute`. Most routers can tell you the template.

Each section below follows one of the examples in the repository. They all monitor the same small orders app: an `orders-table` area, a `status-filter` hook, and an order details page.

## Vite

Initialize in the entry file, before `createRoot`:

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initRenderPulse } from "react-render-pulse";
import { App } from "./App";

initRenderPulse({
  endpoint: "/api/render-pulse",
  sampleRate: 0.1,
  appVersion: import.meta.env.VITE_APP_VERSION,
  getRoute: () => location.pathname.replace(/\/\d+(?=\/|$)/g, "/:id"),
});

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

StrictMode's double effects don't cause double counting.

During development you can run the collector inside Vite's own server, so batches land in a local file without deploying anything. The example does it with a small plugin that mounts the collector with `toNodeListener`:

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { createCollector } from "react-render-pulse-collector";
import { jsonFileStorage } from "react-render-pulse-collector/json-file";
import { toNodeListener } from "react-render-pulse-collector/node";
import { defineConfig, type Connect, type Plugin } from "vite";

function renderPulseCollector(): Plugin {
  const storage = jsonFileStorage({ path: ".render-pulse/batches.jsonl" });
  const collect = toNodeListener(createCollector({ storage, rateLimit: false }));

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/render-pulse") return collect(req, res, next);
    next();
  };

  return {
    name: "render-pulse-collector",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), renderPulseCollector()],
  resolve: {
    // `vite build --mode profiling` uses React's profiling build.
    alias: mode === "profiling" ? { "react-dom/client": "react-dom/profiling" } : {},
  },
  build: { outDir: mode === "profiling" ? "dist-profiling" : "dist" },
}));
```

Then read the file with the viewer:

```bash
npx react-render-pulse-viewer report .render-pulse/batches.jsonl
npx react-render-pulse-viewer serve --file .render-pulse/batches.jsonl
```

In production, deploy the collector separately; see [Collector and storage](/guide/collector). The profiling build is covered in [Modes](/guide/modes#vite).

Example: [examples/vite-react](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/vite-react)

## Next.js App Router

Initialize in `instrumentation-client.ts` in the project root. Next.js runs this file in the browser before the app hydrates, so the very first renders are measured:

```ts
// instrumentation-client.ts
import { initRenderPulse } from "react-render-pulse";

initRenderPulse({
  endpoint: "/api/render-pulse",
  sampleRate: Number(process.env.NEXT_PUBLIC_RENDER_PULSE_SAMPLE_RATE ?? 1),
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
  // Route templates keep dynamic segments together: /orders/42 → /orders/[id].
  getRoute: () => location.pathname.replace(/^\/orders\/[^/]+/, "/orders/[id]"),
});
```

On Next.js versions without `instrumentation-client.ts`, call `initRenderPulse` at the top level of a `"use client"` module that your root layout imports.

Because the package's main entry is marked `"use client"`, a Server Component can render `<RenderMonitor>` directly; it becomes a client boundary there, and its children can still be Server Components:

```tsx
// app/page.tsx (a Server Component)
import Link from "next/link";
import { RenderMonitor } from "react-render-pulse";
import { OrdersTable } from "./orders/OrdersTable";

export default function Page() {
  return (
    <main>
      <h1>Orders</h1>
      <p>
        Open an order, e.g. <Link href="/orders/1001">#1001</Link>.
      </p>
      <RenderMonitor id="orders-table">
        <OrdersTable />
      </RenderMonitor>
    </main>
  );
}
```

`useRenderMonitor` is a hook, so it needs a component marked `"use client"`:

```tsx
// app/orders/OrdersTable.tsx
"use client";

import { useState } from "react";
import { useRenderMonitor } from "react-render-pulse";

export function OrdersTable() {
  const [status, setStatus] = useState("all");
  // ...filter the orders and render the table
  return <StatusFilter value={status} onChange={setStatus} />;
}

function StatusFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  useRenderMonitor("status-filter");

  return (
    <select aria-label="Status" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">All</option>
      <option value="open">Open</option>
    </select>
  );
}
```

::: info What lightweight mode sees here
The filter's state lives inside `<OrdersTable>`, below the `orders-table` monitor. In lightweight mode an area doesn't see updates that start below it, so changing the filter doesn't show up under `orders-table`; only its mount does. `status-filter` records every change, because that component re-renders. Profiling mode (`next build --profile`) sees both. To catch these updates in lightweight mode, move the monitor inside `<OrdersTable>`, around the table. See [Modes](/guide/modes#what-lightweight-mode-can-t-see).
:::

Measurements happen in the browser, during hydration and later client renders. Server rendering isn't measured.

The collector is a route handler. Without `DATABASE_URL` the example stores batches in memory, so it runs without a database:

```ts
// app/api/render-pulse/route.ts
import { createCollector, memoryStorage, type Storage } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

const storage: Storage = process.env.DATABASE_URL
  ? postgresStorage({ url: process.env.DATABASE_URL })
  : memoryStorage();

const collect = createCollector({ storage });

export const POST = collect;
export const OPTIONS = collect;
```

For the profiling build, build with `next build --profile`.

Example: [examples/next-app-router](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/next-app-router)

## Next.js Pages Router

Initialize at module scope in `pages/_app.tsx`. Module scope runs once, before the first render. The Pages Router knows the route template (for example `/orders/[id]`), so `getRoute` reads it from `Router.pathname`:

```tsx
// pages/_app.tsx
import type { AppProps } from "next/app";
import Router, { useRouter } from "next/router";
import { initRenderPulse, RenderMonitor } from "react-render-pulse";

// The window check skips the server render, where initRenderPulse would do nothing anyway.
if (typeof window !== "undefined") {
  initRenderPulse({
    endpoint: "/api/render-pulse",
    sampleRate: Number(process.env.NEXT_PUBLIC_RENDER_PULSE_SAMPLE_RATE ?? 1),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
    // Router throws until it's created, so fall back to the raw path for that moment.
    getRoute: () => {
      try {
        return Router.pathname;
      } catch {
        return location.pathname;
      }
    },
  });
}

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();

  // One area per page, named after the route template.
  return (
    <RenderMonitor id={`page:${pathname}`}>
      <Component {...pageProps} />
    </RenderMonitor>
  );
}
```

Pages can add their own monitors inside, such as `orders-table` around the table on the orders page.

The collector is an API route. Pages API routes use Node's `(req, res)` signature, so wrap it in `toNodeListener`, and turn off Next's body parser so the collector can read and size-limit the raw body:

```ts
// pages/api/render-pulse.ts
import { createCollector, memoryStorage, type Storage } from "react-render-pulse-collector";
import { toNodeListener } from "react-render-pulse-collector/node";
import { postgresStorage } from "react-render-pulse-collector/postgres";

export const config = { api: { bodyParser: false } };

const storage: Storage = process.env.DATABASE_URL
  ? postgresStorage({ url: process.env.DATABASE_URL })
  : memoryStorage();

export default toNodeListener(createCollector({ storage }));
```

Example: [examples/next-pages-router](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/next-pages-router)

## React Router

The example is a single-page app on React Router 8 with a data router. Initialize before rendering the router, and use `matchRoutes` in `getRoute` to report the matched route pattern:

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, matchRoutes, RouterProvider } from "react-router";
import { initRenderPulse } from "react-render-pulse";
import { routes } from "./routes";

const router = createBrowserRouter(routes);

initRenderPulse({
  endpoint: "/api/render-pulse",
  appVersion: import.meta.env.VITE_APP_VERSION,
  // Report the matched route pattern (e.g. /orders/:orderId), so every order
  // page is grouped together and no ids leave the browser.
  getRoute: () => {
    const matches = matchRoutes(routes, router.state.location) ?? [];
    const pattern = matches
      .map((m) => m.route.path ?? "")
      .filter(Boolean)
      .join("/")
      .replace(/\/+/g, "/");
    return pattern.startsWith("/") ? pattern : `/${pattern}`;
  },
});

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

With routes `{ path: "/", children: [{ index: true }, { path: "orders/:orderId" }] }`, `/orders/1042` is reported as `/orders/:orderId`.

A monitor around the `<Outlet />` in a layout route measures whichever page is showing; each page is still reported separately, because the route differs:

```tsx
// src/routes.tsx (excerpt)
import { Link, Outlet } from "react-router";
import { RenderMonitor } from "react-render-pulse";

function Layout() {
  return (
    <div>
      <nav>
        <Link to="/">Orders</Link>
      </nav>
      <RenderMonitor id="route-outlet">
        <Outlet />
      </RenderMonitor>
    </div>
  );
}
```

The example sends batches to `/api/render-pulse`; in development, Vite proxies that to a collector on another port (the Vite example's dev server).

In framework mode (Remix, or React Router with server rendering), call `initRenderPulse` in `app/entry.client.tsx`, which only runs in the browser, and serve the collector from a resource route whose `action` returns `collector(request)`.

Example: [examples/react-router](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/react-router)

## Standalone collector

A collector deployed on its own as a Vercel Function with Postgres storage and an origin allowlist: [examples/collector-vercel](https://github.com/Amalmktk/react-render-pulse/tree/main/examples/collector-vercel). It's walked through in [Collector and storage](/guide/collector#vercel-standalone-collector).
