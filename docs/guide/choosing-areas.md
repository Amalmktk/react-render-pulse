# Choosing areas

An area is everything inside one `<RenderMonitor id>`, or one component that calls `useRenderMonitor(id)`. Reports group measurements by area and route, so the areas you choose decide what questions the data can answer.

## Good places for a monitor

Start with a handful of areas, one per thing you would actually go and optimize:

- **Heavy, data-driven views**: tables, lists, grids, dashboards, charts.
- **Things that re-render often**: search results that update as you type, filters, live-updating panels.
- **Page sections**: the main content of each important route, so you can compare routes.
- **Components you suspect**: anything users report as sluggish.

```tsx
import { RenderMonitor } from "react-render-pulse";

export function OrdersPage() {
  return (
    <RenderMonitor id="orders-page">
      <Filters />
      <RenderMonitor id="orders-table">
        <OrdersTable />
      </RenderMonitor>
    </RenderMonitor>
  );
}
```

## Avoid noise

- **Don't wrap every component.** Small leaf components render in well under a millisecond, and their numbers mostly measure timer resolution. Each area also costs a little time per render and some bytes per batch.
- **Don't put monitors inside long lists.** A `<RenderMonitor>` per row adds overhead to every row and produces one area with thousands of tiny renders. Wrap the list instead.
- **Use stable, descriptive ids.** Ids are what you read in reports. Use a fixed string like `"orders-table"`, not something built from data such as a record id: every distinct id becomes its own area, and data in ids can leak information you don't want to collect.
- **Keep ids short.** Ids longer than 200 characters are truncated, and an empty id is reported as `"(unnamed)"`.

A batch holds at most `maxAreas` area/route pairs (200 by default, up to 1000). Measurements for new pairs past that are dropped and counted in `dropped.areas`, which the viewer reports.

## Nesting

Monitors can be nested. Each one reports its own subtree, and an outer area's time **includes** its inner areas' time. Don't add nested areas together.

In the example above, `orders-page` covers `Filters` and `OrdersTable`; `orders-table` covers just the table. If `orders-page` is slow but `orders-table` isn't, the time is going somewhere else on the page.

When a long task or long animation frame happens while monitored areas are rendering, it's attributed to one of them: the innermost overlapping area that still accounts for at least half of the longest overlapping render. That points at an inner area responsible for most of the time, rather than the outermost wrapper or a tiny sibling that happened to render in the same commit.

In lightweight mode, remember that an area only sees updates that start at or above it. Nesting a monitor inside the component that owns the state is how you catch self-updates. See [Modes](/guide/modes#what-lightweight-mode-can-t-see).

## Shared ids aggregate together

Areas with the same id on the same route are reported together. This is useful for a component used in several places when you care about its total cost:

```tsx
export function HomePage({ featured, recent }: HomePageProps) {
  return (
    <>
      <RenderMonitor id="product-grid">
        <ProductGrid products={featured} />
      </RenderMonitor>
      <NewsletterSignup />
      <RenderMonitor id="product-grid">
        <ProductGrid products={recent} />
      </RenderMonitor>
    </>
  );
}
```

Both instances add to the same render counts, histogram and slow-render count. When you need to tell them apart, give them different ids such as `"product-grid-featured"` and `"product-grid-recent"`. The same id on different routes is reported once per route.

## Route grouping

Every measurement is tagged with the current route, so the same area on different pages is reported separately. The route comes from `getRoute`.

The default takes `location.pathname` and replaces numeric path segments with `:id`, so `/orders/42` and `/orders/7` both become `/orders/:id`. Query strings and hashes are never included.

Paths with other dynamic parts (slugs, UUIDs, usernames) aren't grouped by the default, and could carry information you don't want to collect. Pass a `getRoute` that returns a route template:

```ts
import { initRenderPulse } from "react-render-pulse";

initRenderPulse({
  endpoint: "/api/render-pulse",
  getRoute: () =>
    window.location.pathname
      // UUIDs
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, "/:uuid")
      // /users/<name> and /blog/<slug>
      .replace(/^\/(users|blog)\/[^/]+/, "/$1/:slug")
      // numeric ids
      .replace(/\/\d+(?=\/|$)/g, "/:id"),
});
```

With a router that knows its route patterns, ask it instead. [Frameworks](/guide/frameworks) shows this for [React Router](/guide/frameworks#react-router) (`matchRoutes`) and the [Next.js Pages Router](/guide/frameworks#next-js-pages-router) (`Router.pathname`).

`getRoute` is only called when `location.href` changes, then cached, so it can be as thorough as you need. If it throws, the route is reported as `"/"`. Routes longer than 500 characters are truncated.
