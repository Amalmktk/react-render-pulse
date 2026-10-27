import react from "@vitejs/plugin-react";
import { createCollector } from "react-render-pulse-collector";
import { jsonFileStorage } from "react-render-pulse-collector/json-file";
import { toNodeListener } from "react-render-pulse-collector/node";
import { defineConfig, type Connect, type Plugin } from "vite";

/**
 * Runs the collector inside Vite's dev and preview servers, so batches land
 * in .render-pulse/batches.jsonl without deploying anything. View them with
 * `pnpm report` or `pnpm viewer`. In production, deploy the collector
 * separately (see examples/collector-vercel).
 */
function renderPulseCollector(): Plugin {
  const storage = jsonFileStorage({ path: ".render-pulse/batches.jsonl" });
  const collect = toNodeListener(createCollector({ storage, rateLimit: false }));

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/render-pulse") return collect(req, res, next);

    // Read-only listing for the end-to-end tests: GET /__render-pulse/batches?appVersion=…
    if (url.pathname === "/__render-pulse/batches") {
      const appVersion = url.searchParams.get("appVersion") ?? undefined;
      storage
        .read({ appVersion })
        .then((batches) => {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(batches));
        })
        .catch(next);
      return;
    }

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
    // `vite build --mode profiling` uses React's profiling build, so profiling
    // mode works in production. Only ship this to a sampled group: see the Modes guide.
    alias: mode === "profiling" ? { "react-dom/client": "react-dom/profiling" } : {},
  },
  build: { outDir: mode === "profiling" ? "dist-profiling" : "dist" },
}));
