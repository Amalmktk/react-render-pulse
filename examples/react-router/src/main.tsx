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
