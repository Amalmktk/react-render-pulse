import { describe, expect, it, vi } from "vitest";
import { createCollector } from "../src/handler.js";
import { memoryStorage } from "../src/storage/memory.js";
import type { Storage } from "../src/storage/types.js";
import { post, validPayload } from "./fixtures.js";

function setup(options: Partial<Parameters<typeof createCollector>[0]> = {}) {
  const storage = memoryStorage();
  const handler = createCollector({ storage, ...options });
  return { storage, handler };
}

describe("createCollector", () => {
  it("stores a valid payload and answers 204", async () => {
    const { storage, handler } = setup();
    const response = await handler(post(validPayload()));

    expect(response.status).toBe(204);
    expect(storage.batches).toHaveLength(1);
    expect(storage.batches[0]?.payload).toEqual(validPayload());
    expect(Date.parse(storage.batches[0]?.receivedAt ?? "")).not.toBeNaN();
  });

  it("accepts text/plain bodies, as sent by sendBeacon", async () => {
    const { handler } = setup();
    const response = await handler(post(validPayload(), { headers: { "content-type": "text/plain;charset=UTF-8" } }));
    expect(response.status).toBe(204);
  });

  it("rejects malformed JSON with 400", async () => {
    const { storage, handler } = setup();
    const response = await handler(post("{not json"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
    expect(storage.batches).toHaveLength(0);
  });

  it("rejects payloads that don't match the schema, listing the issues", async () => {
    const { handler } = setup();
    const response = await handler(post({ ...validPayload(), v: 2 }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid payload");
  });

  it("rejects unknown fields, so nothing unexpected (like personal data) gets stored", async () => {
    const { handler } = setup();
    const payload = validPayload();
    const response = await handler(post({ ...payload, session: { ...payload.session, email: "jane@example.com" } }));
    expect(response.status).toBe(400);
  });

  it("rejects histograms of the wrong length", async () => {
    const { handler } = setup();
    const [area] = validPayload().areas;
    const response = await handler(post(validPayload({ areas: [{ ...area!, hist: [1, 2, 3] }] })));
    expect(response.status).toBe(400);
  });

  describe("per-phase timings", () => {
    const phase = (renders: number) => ({
      renders,
      slow: 0,
      totalMs: renders * 2,
      min: 1,
      max: 3,
      p50: 2,
      p75: 2.5,
      p95: 3,
      hist: [0, renders, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    const withPhases = (phases: unknown) => {
      const [area] = validPayload().areas;
      return { ...validPayload(), areas: [{ ...area!, phases }] };
    };

    it("stores timings split into first renders and updates", async () => {
      const { storage, handler } = setup();
      const payload = withPhases({ mount: phase(1), update: phase(41) });
      expect((await handler(post(payload))).status).toBe(204);
      expect(storage.batches[0]?.payload).toEqual(payload);
    });

    it("accepts a batch with only one phase, and one with none (clients before 1.1)", async () => {
      const { handler } = setup();
      expect((await handler(post(withPhases({ update: phase(5) })))).status).toBe(204);
      expect((await handler(post(withPhases({})))).status).toBe(204);
      expect((await handler(post(validPayload()))).status).toBe(204);
    });

    it("rejects unknown phases, unknown fields and histograms of the wrong length", async () => {
      const { handler } = setup();
      expect((await handler(post(withPhases({ hover: phase(1) })))).status).toBe(400);
      expect((await handler(post(withPhases({ mount: { ...phase(1), user: "x" } })))).status).toBe(400);
      expect((await handler(post(withPhases({ mount: { ...phase(1), hist: [1] } })))).status).toBe(400);
    });
  });

  it("rejects oversized bodies with 413, by header or by actual size", async () => {
    const { handler } = setup({ maxBodyBytes: 100 });

    const declared = await handler(post("{}", { headers: { "content-length": "5000" } }));
    expect(declared.status).toBe(413);

    const actual = await handler(post(validPayload()));
    expect(actual.status).toBe(413);
  });

  it("answers 405 for other methods", async () => {
    const { handler } = setup();
    const response = await handler(new Request("https://collector.test/", { method: "GET" }));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("answers CORS preflights", async () => {
    const { handler } = setup();
    const response = await handler(new Request("https://collector.test/", { method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("only echoes allowed origins", async () => {
    const { handler } = setup({ allowedOrigins: ["https://itzamal.in"] });

    const allowed = await handler(post(validPayload(), { headers: { origin: "https://itzamal.in" } }));
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://itzamal.in");

    const other = await handler(post(validPayload(), { headers: { origin: "https://evil.test" } }));
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("refuses to store batches from origins that aren't allowed", async () => {
    const { storage, handler } = setup({ allowedOrigins: ["https://itzamal.in"] });

    const other = await handler(post(validPayload(), { headers: { origin: "https://evil.test" } }));
    expect(other.status).toBe(403);

    const serverSide = await handler(post(validPayload()));
    expect(serverSide.status).toBe(204);
    expect(storage.batches).toHaveLength(1);
  });

  it("rate limits per client and sets Retry-After", async () => {
    const { handler } = setup({ rateLimit: { max: 2, windowMs: 60_000 } });
    const request = () => post(validPayload(), { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });

    expect((await handler(request())).status).toBe(204);
    expect((await handler(request())).status).toBe(204);
    const limited = await handler(request());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    const otherClient = await handler(post(validPayload(), { headers: { "x-forwarded-for": "198.51.100.1" } }));
    expect(otherClient.status).toBe(204);
  });

  it("doesn't rate limit when it's turned off", async () => {
    const { handler } = setup({ rateLimit: false });
    for (let i = 0; i < 200; i++) {
      expect((await handler(post(validPayload(), { headers: { "x-forwarded-for": "1.1.1.1" } }))).status).toBe(204);
    }
  });

  it("answers 500 and reports the error when storage fails", async () => {
    const onError = vi.fn();
    const failing: Storage = {
      write: () => Promise.reject(new Error("db down")),
      read: () => Promise.resolve([]),
    };
    const handler = createCollector({ storage: failing, onError });

    const response = await handler(post(validPayload()));

    expect(response.status).toBe(500);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "db down" }));
  });
});
