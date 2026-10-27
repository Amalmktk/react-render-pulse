import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderMonitor } from "../src/components/RenderMonitor.js";
import { initRenderPulse, type RenderPulse } from "../src/runtime/initRenderPulse.js";
import type { Payload } from "../src/types.js";
import { spin } from "./helpers.js";

let pulse: RenderPulse | null = null;

afterEach(() => {
  cleanup();
  pulse?.destroy();
  pulse = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderSlowArea() {
  render(
    <RenderMonitor id="orders-table">
      <Slow />
    </RenderMonitor>,
  );
}

function Slow() {
  spin(20);
  return <p>Order for jane@example.com</p>;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("initRenderPulse", () => {
  it("builds a v1 payload with session, device, summary, and areas", async () => {
    pulse = initRenderPulse({ debug: false, appVersion: "2.4.0", getRoute: () => "/orders", flushIntervalMs: 0 });
    renderSlowArea();
    await settle();

    const payload = pulse.flush();

    expect(payload).toMatchObject({
      v: 1,
      session: { seq: 1, mode: "profiling", route: "/orders", appVersion: "2.4.0" },
      device: { viewport: expect.stringMatching(/^\d+x\d+$/) },
      summary: { renders: 1, slowRenders: 1 },
      areas: [{ id: "orders-table", route: "/orders", renders: 1, mounts: 1, slow: 1 }],
      dropped: { areas: 0 },
    });
    expect(payload?.areas[0]?.p95).toBeGreaterThan(16);
  });

  it("returns null from flush when nothing was measured", () => {
    pulse = initRenderPulse({ debug: false, flushIntervalMs: 0 });
    expect(pulse.flush()).toBeNull();
  });

  it("sends a beacon to the endpoint when the page is hidden", async () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });
    pulse = initRenderPulse({ endpoint: "/api/render-pulse", flushIntervalMs: 0 });
    renderSlowArea();
    await settle();

    setVisibility("hidden");
    setVisibility("visible");

    expect(sendBeacon).toHaveBeenCalledOnce();
    const [url, body] = sendBeacon.mock.calls[0] as unknown as [string, string];
    expect(url).toBe("/api/render-pulse");
    expect(JSON.parse(body).areas[0].id).toBe("orders-table");
  });

  it("also sends on pagehide", async () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });
    pulse = initRenderPulse({ endpoint: "/collect", flushIntervalMs: 0 });
    renderSlowArea();
    await settle();

    window.dispatchEvent(new Event("pagehide"));

    expect(sendBeacon).toHaveBeenCalledOnce();
  });

  it("flushes on an interval with fetch", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);
    pulse = initRenderPulse({ endpoint: "/collect", flushIntervalMs: 1000 });
    renderSlowArea();
    await settle();

    vi.advanceTimersByTime(1000);

    expect(fetchMock).toHaveBeenCalledWith("/collect", expect.objectContaining({ method: "POST", keepalive: true }));
  });

  it("numbers batches within a session", async () => {
    const payloads: Payload[] = [];
    pulse = initRenderPulse({ debug: false, flushIntervalMs: 0, exporters: [{ onFlush: (p) => payloads.push(p) }] });
    renderSlowArea();
    await settle();
    pulse.flush();
    renderSlowArea();
    await settle();
    pulse.flush();

    expect(payloads.map((p) => p.session.seq)).toEqual([1, 2]);
    expect(payloads[0]?.session.id).toBe(payloads[1]?.session.id);
  });

  it("logs batches to the console when there's no endpoint", async () => {
    const table = vi.spyOn(console, "table").mockImplementation(() => {});
    const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    pulse = initRenderPulse({ flushIntervalMs: 0 });
    renderSlowArea();
    await settle();

    pulse.flush();

    expect(group).toHaveBeenCalledWith(expect.stringContaining("[render-pulse]"));
    expect(table).toHaveBeenCalledWith([expect.objectContaining({ area: "orders-table", renders: 1 })]);
    vi.restoreAllMocks();
  });

  it("keeps ids, routes, and limits within what the collector accepts", async () => {
    const payloads: Payload[] = [];
    pulse = initRenderPulse({
      debug: false,
      flushIntervalMs: 0,
      maxAreas: 1_000_000,
      worstCases: 999,
      getRoute: () => `/${"r".repeat(1000)}`,
      exporters: [{ onFlush: (p) => payloads.push(p) }],
    });
    render(
      <>
        <RenderMonitor id={"x".repeat(500)}>
          <p />
        </RenderMonitor>
        <RenderMonitor id="">
          <p />
        </RenderMonitor>
      </>,
    );
    await settle();
    pulse.flush();

    const ids = payloads[0]?.areas.map((a) => a.id) ?? [];
    expect(ids).toContain("x".repeat(200));
    expect(ids).toContain("(unnamed)");
    expect(payloads[0]?.areas[0]?.route.length).toBe(500);
  });

  it("labels useRenderMonitor timings as lightweight, even in a profiling session", async () => {
    const { useRenderMonitor } = await import("../src/hooks/useRenderMonitor.js");
    const modes: string[] = [];
    pulse = initRenderPulse({
      debug: false,
      flushIntervalMs: 0,
      exporters: [{ onRender: (e) => modes.push(`${e.area}:${e.mode}`) }],
    });

    function Chart() {
      useRenderMonitor("chart");
      return null;
    }
    render(
      <RenderMonitor id="page">
        <Chart />
      </RenderMonitor>,
    );
    await settle();

    expect(pulse.mode).toBe("profiling");
    expect(modes.sort()).toEqual(["chart:lightweight", "page:profiling"]);
  });

  it("stops measuring after destroy", async () => {
    const onRender = vi.fn();
    pulse = initRenderPulse({ debug: false, flushIntervalMs: 0, exporters: [{ onRender }] });
    pulse.destroy();
    renderSlowArea();
    await settle();

    expect(onRender).not.toHaveBeenCalled();
  });

  it("replaces the previous setup when called again", async () => {
    const first = vi.fn();
    const second = vi.fn();
    initRenderPulse({ debug: false, flushIntervalMs: 0, exporters: [{ onRender: first }] });
    pulse = initRenderPulse({ debug: false, flushIntervalMs: 0, exporters: [{ onRender: second }] });
    renderSlowArea();
    await settle();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
