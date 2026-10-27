---
layout: home

hero:
  name: react-render-pulse
  text: Render timings from real users, per component
  tagline: Wrap the parts of your React tree you care about and see how long they take to render on your users' devices, not just your laptop.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Overhead and bundle size
      link: /guide/performance

features:
- title: Component level
  details: "Name areas with the RenderMonitor component or the useRenderMonitor hook. Reports show render counts, slow renders, p50/p75/p95 and the slowest renders for each area and route."
- title: Two measurement modes
  details: Lightweight mode works with any production build. Profiling mode uses React's profiling build for exact per-subtree timings. Auto mode picks the right one.
- title: Small and safe
  details: The client is under 3.75 kB brotli and adds about 10–15 µs per measured render in lightweight mode. It batches data in memory, sends it when the page is hidden, and never lets its own errors reach your app.
- title: Privacy by design
  details: No user IDs, IP addresses, page text, input values or query strings. The session id is random per page load and never stored.
- title: Your own backend
  details: A standard Request-to-Response collector for Vercel, Netlify, Cloudflare Workers or Node, with Postgres and JSON-file storage.
- title: Reports you can act on
  details: A CLI report and a local web viewer list the slowest areas, routes, device classes, and trends by day and app version.
---

## Quick start

```bash
npm install react-render-pulse
```

```tsx
import { createRoot } from "react-dom/client";
import { initRenderPulse, RenderMonitor } from "react-render-pulse";
import { OrdersTable } from "./OrdersTable";

initRenderPulse({ endpoint: "/api/render-pulse", sampleRate: 0.1 });

createRoot(document.getElementById("root")!).render(
  <RenderMonitor id="orders-table">
    <OrdersTable />
  </RenderMonitor>,
);
```

Without an `endpoint`, each batch is logged to the browser console instead, which is the quickest way to try it. Then [deploy a collector](/guide/collector) and [read the reports](/guide/viewer).

## The viewer

<figure class="screenshot">
  <img class="light-only" src="/viewer.png" alt="The web viewer: summary tiles, p75 render time by day and by app version, and the slowest areas table">
  <img class="dark-only" src="/viewer-dark.png" alt="The web viewer in dark mode">
  <figcaption>The web viewer, showing synthetic demo data.</figcaption>
</figure>

## Overhead

A performance tool has to show its own cost. In the benchmark, lightweight mode adds about 10–15 µs per measured render. Profiling mode costs more, and almost all of that comes from React's profiling build itself: a bare `<Profiler>` costs nearly the same. [Performance](/guide/performance) has the full results, how to reproduce them, and the bundle-size budget.
