import { defineConfig } from "tsup";

export default defineConfig({
  // Storage adapters are separate entries: the JSON-file one needs Node's fs,
  // and edge runtimes (Cloudflare, Vercel Edge) shouldn't bundle it.
  entry: ["src/index.ts", "src/postgres.ts", "src/jsonFile.ts", "src/node.ts"],
  format: ["esm", "cjs"],
  // tsup's bundled rollup-plugin-dts crashes against TS 7's compiler API,
  // so declarations are emitted separately via `tsc -p tsconfig.build.json`.
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ["pg", "react-render-pulse", "zod"],
});
