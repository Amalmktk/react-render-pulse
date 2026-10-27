import { afterEach, describe, expect, it, vi } from "vitest";
import { byteLength, serializePayload } from "../src/transport/payload.js";
import { createTransport } from "../src/transport/transport.js";
import type { AreaReport } from "../src/types.js";
import { payload } from "./helpers.js";

function area(id: string, renders: number): AreaReport {
  return {
    id,
    route: "/",
    renders,
    mounts: 0,
    slow: 0,
    totalMs: 0,
    min: 0,
    max: 0,
    p50: 0,
    p75: 0,
    p95: 0,
    hist: new Array(16).fill(0),
    worst: [{ ms: 1, phase: "update", at: 0 }],
  };
}

describe("serializePayload", () => {
  it("returns the JSON unchanged when it fits", () => {
    const p = payload({ areas: [area("a", 1)] });
    expect(serializePayload(p, 60_000)).toBe(JSON.stringify(p));
  });

  it("drops worst cases first, then the least-rendered areas", () => {
    const areas = Array.from({ length: 50 }, (_, i) => area(`area-${i}`, i));
    const json = serializePayload(payload({ areas }), 4_000);

    expect(json).not.toBeNull();
    expect(byteLength(json ?? "")).toBeLessThanOrEqual(4_000);

    const parsed = JSON.parse(json ?? "{}");
    expect(parsed.areas.every((a: AreaReport) => a.worst.length === 0)).toBe(true);
    expect(parsed.areas[0].id).toBe("area-49");
    expect(parsed.dropped.areas).toBe(50 - parsed.areas.length);
  });

  it("returns null when even an empty payload doesn't fit", () => {
    expect(serializePayload(payload(), 10)).toBeNull();
  });
});

describe("createTransport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(status: number | "error") {
    const fetchMock = vi.fn(() =>
      status === "error" ? Promise.reject(new Error("offline")) : Promise.resolve(new Response(null, { status })),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("uses sendBeacon when unloading", () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    const fetchMock = stubFetch(200);

    createTransport({ endpoint: "/collect", maxAttempts: 3, maxQueued: 5 }).send("{}", { unloading: true });

    expect(sendBeacon).toHaveBeenCalledWith("/collect", "{}");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to fetch with keepalive when sendBeacon refuses", () => {
    vi.stubGlobal("navigator", { sendBeacon: () => false });
    const fetchMock = stubFetch(200);

    createTransport({ endpoint: "/collect", maxAttempts: 3, maxQueued: 5 }).send("{}", { unloading: true });

    expect(fetchMock).toHaveBeenCalledWith("/collect", { method: "POST", body: "{}", keepalive: true });
  });

  it("falls back to fetch when sendBeacon throws", () => {
    vi.stubGlobal("navigator", {
      sendBeacon: () => {
        throw new Error("blocked");
      },
    });
    const fetchMock = stubFetch(200);

    expect(() =>
      createTransport({ endpoint: "/collect", maxAttempts: 3, maxQueued: 5 }).send("{}", { unloading: true }),
    ).not.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries failed sends on the next send, up to maxAttempts", async () => {
    const fetchMock = stubFetch("error");
    const transport = createTransport({ endpoint: "/collect", maxAttempts: 2, maxQueued: 5 });

    transport.send("first", { unloading: false });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    transport.send("second", { unloading: false });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.map((call) => (call as unknown[])[1])).toMatchObject([
      { body: "first" },
      { body: "first" },
      { body: "second" },
    ]);

    // "first" has used its 2 attempts; only "second" is retried.
    await new Promise((resolve) => setTimeout(resolve, 0));
    transport.send("third", { unloading: false });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls.slice(3).map((call) => ((call as unknown[])[1] as RequestInit).body)).toEqual([
      "second",
      "third",
    ]);
  });

  it("doesn't retry payloads the collector rejected", async () => {
    const fetchMock = stubFetch(400);
    const transport = createTransport({ endpoint: "/collect", maxAttempts: 3, maxQueued: 5 });

    transport.send("bad", { unloading: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    transport.send("next", { unloading: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(((fetchMock.mock.calls[1] as unknown[])[1] as RequestInit).body).toBe("next");
  });

  it("does nothing when fetch is missing", () => {
    vi.stubGlobal("fetch", undefined);
    vi.stubGlobal("navigator", {});
    expect(() =>
      createTransport({ endpoint: "/collect", maxAttempts: 3, maxQueued: 5 }).send("{}", { unloading: true }),
    ).not.toThrow();
  });
});
