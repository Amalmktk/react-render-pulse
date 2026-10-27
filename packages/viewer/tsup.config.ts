import { defineConfig } from "tsup";

const external = ["pg", "react-render-pulse", "react-render-pulse-collector"];

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    // tsup's bundled rollup-plugin-dts crashes against TS 7's compiler API,
    // so declarations are emitted separately via `tsc -p tsconfig.build.json`.
    dts: false,
    sourcemap: true,
    // Both configs build in parallel, so `dist` is cleaned by the build script instead.
    clean: false,
    splitting: false,
    external,
  },
  {
    // The CLI is ESM-only; it finds the web viewer next to itself in dist/web.
    entry: { cli: "src/cli/main.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: true,
    splitting: false,
    external: [...external, "react-render-pulse-collector/postgres"],
  },
]);
