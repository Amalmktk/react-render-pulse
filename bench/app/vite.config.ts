import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Two builds, one per mode:
 * - `plain`: React's production build, render-pulse in lightweight mode
 * - `profiling`: React's profiling build, render-pulse in profiling mode
 * Each switches between a monitored and an unmonitored tree at runtime, so
 * overhead is measured inside one page (see run.mjs).
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __PULSE_MODE__: JSON.stringify(mode === "profiling" ? "profiling" : "lightweight"),
  },
  resolve: {
    alias: mode === "profiling" ? { "react-dom/client": "react-dom/profiling" } : {},
  },
  build: { outDir: `dist/${mode}`, emptyOutDir: true },
}));
