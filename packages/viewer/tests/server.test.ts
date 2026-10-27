import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { memoryStorage } from "react-render-pulse-collector";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createViewerServer, type ReportResponse } from "../src/server/server.js";
import { area, batch } from "./fixtures.js";

let server: Server;
let base: string;
let webRoot: string;

beforeAll(async () => {
  webRoot = await mkdtemp(join(tmpdir(), "viewer-web-"));
  await writeFile(join(webRoot, "index.html"), "<!doctype html><title>viewer</title>");

  const storage = memoryStorage();
  const recent = new Date(Date.now() - 3_600_000).toISOString();
  await storage.write(batch({ session: "a", receivedAt: recent, appVersion: "1.0.0", areas: [area("table", 30, 4)] }));
  await storage.write(batch({ session: "b", receivedAt: recent, appVersion: "1.1.0", areas: [area("table", 3, 4)] }));
  await storage.write(batch({ session: "c", receivedAt: "2020-01-01T00:00:00.000Z", areas: [area("old", 3, 1)] }));

  server = createViewerServer({ storage, webRoot });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(webRoot, { recursive: true, force: true });
});

describe("createViewerServer", () => {
  it("serves the report for a time range, with the versions in it", async () => {
    const response = await fetch(`${base}/api/report?since=7d`);
    const body = (await response.json()) as ReportResponse;

    expect(response.status).toBe(200);
    expect(body.report.sessions).toBe(2);
    expect(body.versions.sort()).toEqual(["1.0.0", "1.1.0"]);
  });

  it("filters by version but still lists every version", async () => {
    const body = (await (await fetch(`${base}/api/report?since=7d&version=1.1.0`)).json()) as ReportResponse;
    expect(body.report.sessions).toBe(1);
    expect(body.report.areas[0]?.p75).toBeLessThanOrEqual(4);
    expect(body.versions).toHaveLength(2);
  });

  it("answers 400 for a bad range", async () => {
    expect((await fetch(`${base}/api/report?since=forever`)).status).toBe(400);
  });

  it("serves the web viewer, falling back to index.html for app routes", async () => {
    const index = await fetch(`${base}/`);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(await (await fetch(`${base}/some/route`)).text()).toContain("<title>viewer</title>");
  });

  it("refuses paths outside the web root and non-GET methods", async () => {
    // A secret next to the web root must never be served, however the path is encoded.
    await writeFile(join(webRoot, "..", "viewer-secret.txt"), "secret");
    for (const path of ["/..%2Fviewer-secret.txt", "/%2E%2E/viewer-secret.txt", "/..%5Cviewer-secret.txt"]) {
      const response = await fetch(`${base}${path}`);
      expect([403, 404]).toContain(response.status);
      expect(await response.text()).not.toContain("secret\n");
    }
    await rm(join(webRoot, "..", "viewer-secret.txt"), { force: true });
    expect((await fetch(`${base}/api/report`, { method: "POST" })).status).toBe(405);
  });

  it("answers 404 for missing assets", async () => {
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
  });
});
