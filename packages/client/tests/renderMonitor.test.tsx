import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RenderMonitor } from "../src/components/RenderMonitor.js";
import { useRenderMonitor } from "../src/hooks/useRenderMonitor.js";
import { initRenderPulse, type RenderPulse, type RenderPulseOptions } from "../src/runtime/initRenderPulse.js";
import type { RenderEvent } from "../src/types.js";
import { spin } from "./helpers.js";

let pulse: RenderPulse | null = null;

function start(options: RenderPulseOptions = {}) {
  const events: RenderEvent[] = [];
  pulse = initRenderPulse({
    debug: false,
    flushIntervalMs: 0,
    exporters: [{ onRender: (e) => events.push(e) }],
    ...options,
  });
  return events;
}

// Microtasks let lightweight measurements settle (see EndMarker).
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  pulse?.destroy();
  pulse = null;
});

function Slow({ ms, children }: { ms: number; children?: ReactNode }) {
  spin(ms);
  return <div>{children}</div>;
}

describe("<RenderMonitor>", () => {
  // Vitest runs React's development build, where <Profiler> reports timings
  // the same way the profiling build does in production.
  describe("profiling mode", () => {
    it("auto-detects the profiling build and records a mount, then updates", async () => {
      const events = start();
      const { rerender } = render(
        <RenderMonitor id="table">
          <Slow ms={2} />
        </RenderMonitor>,
      );
      rerender(
        <RenderMonitor id="table">
          <Slow ms={2} />
        </RenderMonitor>,
      );
      await settle();

      expect(pulse?.mode).toBe("profiling");
      expect(events.map((e) => [e.area, e.phase, e.mode])).toEqual([
        ["table", "mount", "profiling"],
        ["table", "update", "profiling"],
      ]);
      expect(events[0]?.duration).toBeGreaterThanOrEqual(1.5);
    });

    it("sees updates that start inside the area", async () => {
      const events = start({ mode: "profiling" });
      let increment = () => {};

      function Counter() {
        const [count, setCount] = useState(0);
        increment = () => setCount((c) => c + 1);
        return <span>{count}</span>;
      }

      render(
        <RenderMonitor id="counter">
          <Counter />
        </RenderMonitor>,
      );
      act(() => increment());
      await settle();

      expect(events.map((e) => e.phase)).toEqual(["mount", "update"]);
    });

    it("reports nested areas separately, the outer one including the inner", async () => {
      const events = start({ mode: "profiling" });
      render(
        <RenderMonitor id="page">
          <Slow ms={1} />
          <RenderMonitor id="table">
            <Slow ms={5} />
          </RenderMonitor>
        </RenderMonitor>,
      );
      await settle();

      const page = events.find((e) => e.area === "page");
      const table = events.find((e) => e.area === "table");
      expect(table?.duration).toBeGreaterThanOrEqual(4.5);
      expect(page?.duration).toBeGreaterThanOrEqual(table?.duration ?? Infinity);
    });
  });

  describe("lightweight mode", () => {
    it("measures with markers and ignores Profiler callbacks", async () => {
      const events = start({ mode: "lightweight" });
      const { rerender } = render(
        <RenderMonitor id="chart">
          <Slow ms={5} />
        </RenderMonitor>,
      );
      rerender(
        <RenderMonitor id="chart">
          <Slow ms={5} />
        </RenderMonitor>,
      );
      await settle();

      expect(pulse?.mode).toBe("lightweight");
      expect(events.map((e) => [e.area, e.phase, e.mode])).toEqual([
        ["chart", "mount", "lightweight"],
        ["chart", "update", "lightweight"],
      ]);
      expect(events.every((e) => e.duration >= 4.5)).toBe(true);
    });

    it("ranks deliberately slow areas in the right order", async () => {
      const events = start({ mode: "lightweight" });
      render(
        <>
          <RenderMonitor id="fast">
            <Slow ms={1} />
          </RenderMonitor>
          <RenderMonitor id="slow">
            <Slow ms={12} />
          </RenderMonitor>
          <RenderMonitor id="medium">
            <Slow ms={5} />
          </RenderMonitor>
        </>,
      );
      await settle();

      const byDuration = [...events].sort((a, b) => b.duration - a.duration).map((e) => e.area);
      expect(byDuration).toEqual(["slow", "medium", "fast"]);
    });

    it("records once per commit under StrictMode", async () => {
      const events = start({ mode: "lightweight" });
      render(
        <StrictMode>
          <RenderMonitor id="strict">
            <Slow ms={1} />
          </RenderMonitor>
        </StrictMode>,
      );
      await settle();

      expect(events.filter((e) => e.area === "strict")).toHaveLength(1);
    });
  });

  it("renders children as usual when render-pulse isn't initialized", () => {
    const { getByText } = render(
      <RenderMonitor id="table">
        <p>rows</p>
      </RenderMonitor>,
    );
    expect(getByText("rows")).toBeTruthy();
  });

  it("doesn't remount children when initRenderPulse runs after the first render", () => {
    let mounts = 0;
    function Child() {
      useState(() => mounts++);
      return null;
    }

    const { rerender } = render(
      <RenderMonitor id="late">
        <Child />
      </RenderMonitor>,
    );
    start();
    rerender(
      <RenderMonitor id="late">
        <Child />
      </RenderMonitor>,
    );

    expect(mounts).toBe(1);
  });

  it("records nothing in unsampled sessions", async () => {
    const events = start({ sampleRate: 0 });
    render(
      <RenderMonitor id="table">
        <Slow ms={1} />
      </RenderMonitor>,
    );
    await settle();

    expect(pulse?.sampled).toBe(false);
    expect(events).toEqual([]);
    expect(pulse?.flush()).toBeNull();
  });
});

describe("useRenderMonitor", () => {
  it("counts every render of the component", async () => {
    const events = start();
    let increment = () => {};

    function PriceChart() {
      useRenderMonitor("price-chart");
      const [count, setCount] = useState(0);
      increment = () => setCount((c) => c + 1);
      spin(2);
      return <span>{count}</span>;
    }

    render(<PriceChart />);
    act(() => increment());
    act(() => increment());

    expect(events.map((e) => [e.area, e.phase])).toEqual([
      ["price-chart", "mount"],
      ["price-chart", "update"],
      ["price-chart", "update"],
    ]);
    expect(events.every((e) => e.duration >= 1.5)).toBe(true);
  });

  it("records once per commit under StrictMode", () => {
    const events = start();
    function Widget() {
      useRenderMonitor("widget");
      return null;
    }

    render(
      <StrictMode>
        <Widget />
      </StrictMode>,
    );

    expect(events).toHaveLength(1);
  });
});
