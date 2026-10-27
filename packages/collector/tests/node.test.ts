import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createCollector } from "../src/handler.js";
import { toNodeListener } from "../src/node.js";
import { memoryStorage } from "../src/storage/memory.js";
import { validPayload } from "./fixtures.js";

let server: Server | null = null;

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  server = null;
});

async function listen(listener: ReturnType<typeof toNodeListener>): Promise<string> {
  server = createServer(listener);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("toNodeListener", () => {
  it("serves the collector on node:http", async () => {
    const storage = memoryStorage();
    const base = await listen(toNodeListener(createCollector({ storage })));

    const response = await fetch(`${base}/api/render-pulse`, { method: "POST", body: JSON.stringify(validPayload()) });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(storage.batches).toHaveLength(1);
  });

  it("rate limits by the socket address when there's no proxy", async () => {
    const base = await listen(
      toNodeListener(createCollector({ storage: memoryStorage(), rateLimit: { max: 1, windowMs: 60_000 } })),
    );
    const send = () => fetch(`${base}/`, { method: "POST", body: JSON.stringify(validPayload()) });

    expect((await send()).status).toBe(204);
    expect((await send()).status).toBe(429);
  });

  it("passes error responses through", async () => {
    const base = await listen(toNodeListener(createCollector({ storage: memoryStorage() })));
    const response = await fetch(`${base}/`, { method: "POST", body: "nope" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
  });
});
