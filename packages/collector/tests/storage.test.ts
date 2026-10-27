import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { jsonFileStorage, readJsonLines } from "../src/storage/jsonFile.js";
import { memoryStorage } from "../src/storage/memory.js";
import { postgresStorage, type SqlClient } from "../src/storage/postgres.js";
import type { StoredBatch } from "../src/storage/types.js";
import { validPayload } from "./fixtures.js";

function batch(receivedAt: string, appVersion = "1.0.0"): StoredBatch {
  const payload = validPayload();
  return { receivedAt, payload: { ...payload, session: { ...payload.session, appVersion } } };
}

describe("memoryStorage", () => {
  it("filters by time and version, newest first, with a limit", async () => {
    const storage = memoryStorage();
    await storage.write(batch("2026-10-01T00:00:00.000Z", "1.0.0"));
    await storage.write(batch("2026-10-02T00:00:00.000Z", "1.1.0"));
    await storage.write(batch("2026-10-03T00:00:00.000Z", "1.1.0"));

    const read = await storage.read({ since: new Date("2026-10-02T00:00:00Z"), appVersion: "1.1.0", limit: 5 });
    expect(read.map((b) => b.receivedAt)).toEqual(["2026-10-03T00:00:00.000Z", "2026-10-02T00:00:00.000Z"]);

    const limited = await storage.read({ limit: 1 });
    expect(limited).toHaveLength(1);

    const before = await storage.read({ until: new Date("2026-10-02T00:00:00Z") });
    expect(before.map((b) => b.payload.session.appVersion)).toEqual(["1.0.0"]);
  });
});

describe("jsonFileStorage", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "render-pulse-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("appends batches as JSON Lines and reads them back", async () => {
    const storage = jsonFileStorage({ path: join(dir, "nested", "batches.jsonl") });
    await Promise.all([
      storage.write(batch("2026-10-01T00:00:00.000Z")),
      storage.write(batch("2026-10-02T00:00:00.000Z")),
    ]);

    const read = await storage.read();
    expect(read.map((b) => b.receivedAt)).toEqual(["2026-10-02T00:00:00.000Z", "2026-10-01T00:00:00.000Z"]);
  });

  it("reads a missing file as empty and skips corrupt lines", async () => {
    expect(await readJsonLines(join(dir, "missing.jsonl"))).toEqual([]);

    const path = join(dir, "partial.jsonl");
    await writeFile(path, `${JSON.stringify(batch("2026-10-01T00:00:00.000Z"))}\n{"receivedAt":"2026-10-0`);
    expect(await readJsonLines(path)).toHaveLength(1);
  });
});

describe("postgresStorage", () => {
  function fakeClient() {
    const queries: { text: string; params: unknown[] | undefined }[] = [];
    const client: SqlClient = {
      async query(text, params) {
        queries.push({ text, params });
        if (text.startsWith("SELECT")) {
          return { rows: [{ received_at: new Date("2026-10-01T00:00:00Z"), payload: validPayload() }] };
        }
        return { rows: [] };
      },
    };
    return { client, queries };
  }

  it("creates the table once, then inserts with parameters", async () => {
    const { client, queries } = fakeClient();
    const storage = postgresStorage({ client });

    await storage.write(batch("2026-10-01T00:00:00.000Z"));
    await storage.write(batch("2026-10-02T00:00:00.000Z"));

    expect(queries.filter((q) => q.text.includes("CREATE TABLE"))).toHaveLength(1);
    const inserts = queries.filter((q) => q.text.startsWith("INSERT"));
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.params?.slice(0, 5)).toEqual([
      "2026-10-01T00:00:00.000Z",
      validPayload().session.id,
      "1.0.0",
      "/orders",
      "lightweight",
    ]);
  });

  it("builds a parameterized query from the filters", async () => {
    const { client, queries } = fakeClient();
    const storage = postgresStorage({ client, autoMigrate: false });

    const read = await storage.read({
      since: new Date("2026-10-01T00:00:00Z"),
      until: new Date("2026-10-08T00:00:00Z"),
      appVersion: "2.4.0",
      limit: 100,
    });

    const select = queries.at(-1);
    expect(select?.text).toBe(
      "SELECT received_at, payload FROM render_pulse_batches WHERE received_at >= $1 AND received_at < $2 AND app_version = $3 ORDER BY received_at DESC LIMIT $4",
    );
    expect(select?.params).toEqual(["2026-10-01T00:00:00.000Z", "2026-10-08T00:00:00.000Z", "2.4.0", 100]);
    expect(read).toEqual([{ receivedAt: "2026-10-01T00:00:00.000Z", payload: validPayload() }]);
  });

  it("rejects unsafe table names", () => {
    const { client } = fakeClient();
    expect(() => postgresStorage({ client, table: "batches; DROP TABLE users" })).toThrow("Invalid table name");
  });

  it("retries the migration after a failure", async () => {
    let fail = true;
    const client: SqlClient = {
      async query(text) {
        if (text.includes("CREATE TABLE") && fail) {
          fail = false;
          throw new Error("connection reset");
        }
        return { rows: [] };
      },
    };
    const storage = postgresStorage({ client });

    await expect(storage.write(batch("2026-10-01T00:00:00.000Z"))).rejects.toThrow("connection reset");
    await expect(storage.write(batch("2026-10-01T00:00:00.000Z"))).resolves.toBeUndefined();
  });
});
