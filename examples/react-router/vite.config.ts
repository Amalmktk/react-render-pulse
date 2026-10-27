import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Batches go to the collector at /api/render-pulse; in development this
// proxies to the Vite example's collector (`pnpm --filter example-vite-react dev`)
// or any collector you run on port 5173.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { "/api/render-pulse": "http://localhost:5173" } },
});
