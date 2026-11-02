---
"react-render-pulse": patch
---

Docs: warn against `useRenderMonitor` in a header or layout that renders before the rest of the page, where its first-render duration covers the whole page. Use `<RenderMonitor>` inside the component instead.
