import { defineConfig, devices } from "@playwright/test";

const example = "-C ../examples/vite-react";

// Two production builds of examples/vite-react, each served with the
// collector middleware: the regular build (lightweight mode) and React's
// profiling build (profiling mode).
// (Not 4317/4318: those are the OpenTelemetry OTLP ports, often taken by a local agent.)
export const PORTS = { lightweight: 5417, profiling: 5418 } as const;

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  // Three engines at once on one machine starve each other; timings here are real.
  workers: 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: `pnpm ${example} run build && pnpm ${example} exec vite preview --port ${PORTS.lightweight} --strictPort`,
      port: PORTS.lightweight,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm ${example} run build:profiling && pnpm ${example} exec vite preview --mode profiling --outDir dist-profiling --port ${PORTS.profiling} --strictPort`,
      port: PORTS.profiling,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
