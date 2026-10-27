import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/aggregate/**", "src/sample/**", "src/transport/**"],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
});
