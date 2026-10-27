import { afterEach, describe, expect, it, vi } from "vitest";
import { createModeDetector } from "../src/modes/detect.js";
import { observeLongTasks } from "../src/observe/longtasks.js";
import { createRenderWindows } from "../src/observe/renderWindows.js";

describe("createRenderWindows", () => {
  it("returns null when no render overlaps", () => {
    const windows = createRenderWindows();
    windows.add("table", 0, 10, 10);
    expect(windows.findArea(20, 30)).toBeNull();
  });

  it("blames the inner area when it accounts for most of the outer one", () => {
    const windows = createRenderWindows();
    windows.add("page", 0, 100, 100);
    windows.add("table", 0, 100, 90);
    windows.add("filters", 0, 100, 5);
    expect(windows.findArea(10, 80)).toBe("table");
  });

  it("blames the outer area when no inner area explains the time", () => {
    const windows = createRenderWindows();
    windows.add("page", 0, 100, 100);
    windows.add("filters", 0, 100, 5);
    expect(windows.findArea(10, 80)).toBe("page");
  });

  it("forgets windows older than the ring size", () => {
    const windows = createRenderWindows(2);
    windows.add("old", 0, 10, 10);
    windows.add("a", 100, 110, 10);
    windows.add("b", 200, 210, 10);
    expect(windows.findArea(0, 10)).toBeNull();
  });
});

describe("createModeDetector", () => {
  it("auto starts lightweight and switches on the first Profiler callback", () => {
    const detector = createModeDetector("auto");
    expect(detector.current()).toBe("lightweight");
    expect(detector.measuresWithMarks()).toBe(true);
    detector.profilerFired();
    expect(detector.current()).toBe("profiling");
    expect(detector.measuresWithMarks()).toBe(false);
  });

  it("keeps a forced mode", () => {
    const lightweight = createModeDetector("lightweight");
    lightweight.profilerFired();
    expect(lightweight.current()).toBe("lightweight");
    expect(createModeDetector("profiling").current()).toBe("profiling");
  });
});

describe("observeLongTasks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing without PerformanceObserver", () => {
    vi.stubGlobal("PerformanceObserver", undefined);
    const stop = observeLongTasks(50, () => {});
    expect(() => stop()).not.toThrow();
  });

  it("observes only supported entry types and filters by threshold", () => {
    const callbacks: ((list: { getEntries: () => { startTime: number; duration: number }[] }) => void)[] = [];
    const observe = vi.fn();
    const disconnect = vi.fn();

    class FakeObserver {
      static supportedEntryTypes = ["longtask"];
      constructor(callback: (typeof callbacks)[number]) {
        callbacks.push(callback);
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal("PerformanceObserver", FakeObserver);

    const seen: unknown[] = [];
    const stop = observeLongTasks(60, (task) => seen.push(task));
    callbacks[0]?.({
      getEntries: () => [
        { startTime: 1, duration: 55 },
        { startTime: 2, duration: 70 },
      ],
    });
    stop();

    expect(observe).toHaveBeenCalledWith({ type: "longtask", buffered: true });
    expect(seen).toEqual([{ kind: "longtask", startTime: 2, duration: 70 }]);
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
