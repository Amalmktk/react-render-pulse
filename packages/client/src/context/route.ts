/** Default route reader: the path with numeric segments replaced, so `/orders/42` and `/orders/7` group together. */
export function defaultGetRoute(): string {
  if (typeof location === "undefined") return "/";
  return location.pathname.replace(/\/\d+(?=\/|$)/g, "/:id");
}

/**
 * Wraps a route reader so it only runs when the URL changes, since it's
 * called on every measured render.
 */
export function createRouteReader(getRoute: () => string): () => string {
  let lastHref: string | null = null;
  let lastRoute = "/";

  return () => {
    const href = typeof location === "undefined" ? "" : location.href;
    if (href !== lastHref) {
      lastHref = href;
      lastRoute = getRoute();
    }
    return lastRoute;
  };
}
