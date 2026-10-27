import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderMonitor } from "../src/components/RenderMonitor.js";
import { useRenderMonitor } from "../src/hooks/useRenderMonitor.js";
import { initRenderPulse, type RenderPulse } from "../src/runtime/initRenderPulse.js";

// Errors inside render-pulse must never reach the app: every case here
// breaks something render-pulse depends on, and the app must keep rendering.

let pulse: RenderPulse | null = null;

afterEach(() => {
  cleanup();
  pulse?.destroy();
  pulse = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function App() {
  useRenderMonitor("app");
  const [count, setCount] = useState(0);
  return (
    <RenderMonitor id="area">
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        clicked {count}
      </button>
    </RenderMonitor>
  );
}

async function exercise() {
  const { getByRole } = render(<App />);
  await act(async () => {
    getByRole("button").click();
    await Promise.resolve();
  });
  expect(getByRole("button").textContent).toBe("clicked 1");
  expect(() => pulse?.flush()).not.toThrow();
  expect(() => window.dispatchEvent(new Event("pagehide"))).not.toThrow();
}

describe("safe failure", () => {
  it("survives exporters that throw", async () => {
    const boom = () => {
      throw new Error("exporter");
    };
    pulse = initRenderPulse({
      debug: false,
      flushIntervalMs: 0,
      exporters: [{ onRender: boom, onFlush: boom, onLongTask: boom }],
    });
    await exercise();
  });

  it("survives a getRoute that throws", async () => {
    pulse = initRenderPulse({
      debug: false,
      flushIntervalMs: 0,
      getRoute: () => {
        throw new Error("route");
      },
    });
    await exercise();
    // The route falls back to "/" instead of losing the measurement.
  });

  it("survives missing browser APIs", async () => {
    vi.stubGlobal("PerformanceObserver", undefined);
    vi.stubGlobal("TextEncoder", undefined);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", undefined);
    pulse = initRenderPulse({ endpoint: "/collect", flushIntervalMs: 0 });
    await exercise();
  });

  it("survives a blocked sendBeacon and an endpoint that's down", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      sendBeacon: () => {
        throw new TypeError("blocked by an extension");
      },
    });
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    pulse = initRenderPulse({ endpoint: "/collect", flushIntervalMs: 0 });
    await exercise();
  });

  it("survives a crypto API that throws", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        throw new Error("insecure context");
      },
    });
    pulse = initRenderPulse({ debug: false, flushIntervalMs: 0 });
    await exercise();
    expect(pulse.sampled).toBe(true);
  });

  it("logs internal errors only in debug mode", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "table").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    const boom = () => {
      throw new Error("exporter");
    };

    pulse = initRenderPulse({ debug: true, flushIntervalMs: 0, exporters: [{ onRender: boom }] });
    await exercise();

    expect(warn).toHaveBeenCalledWith("[render-pulse]", expect.any(Error));
  });
});
