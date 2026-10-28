# react-render-pulse documentation

**Read it as a website:** https://amalmktk.github.io/react-render-pulse/ (search, navigation and working links).

The same pages as Markdown, for browsing here on GitHub:

## Guide

| Page | What's in it |
| --- | --- |
| [Getting started](guide/getting-started.md) | Install, start the client, add a first monitor, check it locally |
| [Architecture](guide/architecture.md) | How it works: measuring, aggregating, sending, the payload, the collector, storage, the viewer, deployment shapes |
| [Collecting results](guide/collecting-results.md) | End to end: choose where data goes, deploy a collector, check data arrives, read it with the viewer, SQL or code |
| [Modes](guide/modes.md) | Lightweight vs. profiling mode, auto-detection, enabling React's profiling build in Vite and Next.js |
| [Choosing areas](guide/choosing-areas.md) | Where to put monitors for useful results without noise |
| [What we collect](guide/what-we-collect.md) | Every payload field, and the privacy guarantees |
| [Collector and storage](guide/collector.md) | Deploying on Vercel, Netlify, Cloudflare Workers and Node; Postgres, files, custom storage; rate limits, CORS |
| [Viewer](guide/viewer.md) | The terminal report and web viewer, and how to act on what they show |
| [Frameworks](guide/frameworks.md) | Vite, Next.js App Router and Pages Router, React Router |
| [OpenTelemetry](guide/opentelemetry.md) | Sending measurements to an OpenTelemetry pipeline |
| [Performance](guide/performance.md) | Measured overhead and accuracy, and how to reproduce them |

## API reference

- [react-render-pulse](api/client.md): the browser client
- [react-render-pulse-collector](api/collector.md): the collector endpoint and storage adapters
- [react-render-pulse-viewer](api/viewer.md): the CLI, web viewer and report functions

## Design decisions

- [000: Gap note](decisions/000-gap-note.md): what existing tools miss
- [001: Measurement modes and the overhead budget](decisions/001-modes.md)

Links between pages are written for the website, so they work there rather than on GitHub.
