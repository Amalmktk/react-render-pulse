import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  // Relative asset URLs, so the CLI can serve the build from any path.
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
  server: {
    // `pnpm dev` here + `react-render-pulse-viewer serve --file …` on 4173 for the API.
    proxy: { "/api": "http://127.0.0.1:4173" },
  },
});
