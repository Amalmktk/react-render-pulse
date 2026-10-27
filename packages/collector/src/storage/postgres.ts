import type { Payload } from "react-render-pulse/core";
import type { BatchQuery, Storage, StoredBatch } from "./types.js";

/** The one method used from a Postgres client. `pg`'s `Pool` and `Client` both fit. */
export interface SqlClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export type PostgresStorageOptions = (
  | {
      /** A connection string, e.g. `process.env.DATABASE_URL`. Needs the `pg` package installed. */
      url: string;
    }
  | {
      /** An existing client or pool. */
      client: SqlClient;
    }
) & {
  /** Table name. Defaults to `render_pulse_batches`. */
  table?: string | undefined;
  /** Creates the table and indexes on first use if they're missing. Defaults to true. */
  autoMigrate?: boolean | undefined;
};

export interface PostgresStorage extends Storage {
  /** Creates the table and indexes if they don't exist. Safe to run repeatedly. */
  migrate: () => Promise<void>;
  /** Closes the pool this adapter created from `url`. Does nothing for a client you passed in. */
  close: () => Promise<void>;
}

export function postgresStorage(options: PostgresStorageOptions): PostgresStorage {
  const table = options.table ?? "render_pulse_batches";
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(table)) throw new Error(`Invalid table name: ${table}`);

  let clientPromise: Promise<SqlClient> | null = null;
  let ownedPool: { end: () => Promise<void> } | null = null;
  let migrated: Promise<void> | null = null;

  function client(): Promise<SqlClient> {
    if ("client" in options) return Promise.resolve(options.client);
    clientPromise ??= import("pg").then((pg) => {
      const Pool = pg.default?.Pool ?? pg.Pool;
      const pool = new Pool({ connectionString: options.url, max: 3 });
      ownedPool = pool;
      return pool;
    });
    return clientPromise;
  }

  async function migrate(): Promise<void> {
    const sql = await client();
    await sql.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        session_id TEXT NOT NULL,
        app_version TEXT,
        route TEXT NOT NULL,
        mode TEXT NOT NULL,
        payload JSONB NOT NULL
      )`);
    await sql.query(`CREATE INDEX IF NOT EXISTS ${table}_received_at_idx ON ${table} (received_at DESC)`);
    await sql.query(`CREATE INDEX IF NOT EXISTS ${table}_app_version_idx ON ${table} (app_version, received_at DESC)`);
  }

  function ready(): Promise<void> {
    if (options.autoMigrate === false) return Promise.resolve();
    migrated ??= migrate().catch((error: unknown) => {
      migrated = null; // Try again on the next call.
      throw error;
    });
    return migrated;
  }

  return {
    migrate,
    async write(batch: StoredBatch) {
      await ready();
      const { session } = batch.payload;
      await (await client()).query(
        `INSERT INTO ${table} (received_at, session_id, app_version, route, mode, payload) VALUES ($1, $2, $3, $4, $5, $6)`,
        [batch.receivedAt, session.id, session.appVersion, session.route, session.mode, JSON.stringify(batch.payload)],
      );
    },
    async read(query: BatchQuery = {}) {
      await ready();
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (query.since) {
        params.push(query.since.toISOString());
        conditions.push(`received_at >= $${params.length}`);
      }
      if (query.until) {
        params.push(query.until.toISOString());
        conditions.push(`received_at < $${params.length}`);
      }
      if (query.appVersion !== undefined) {
        params.push(query.appVersion);
        conditions.push(`app_version = $${params.length}`);
      }

      let text = `SELECT received_at, payload FROM ${table}`;
      if (conditions.length > 0) text += ` WHERE ${conditions.join(" AND ")}`;
      text += " ORDER BY received_at DESC";
      if (query.limit !== undefined) {
        params.push(query.limit);
        text += ` LIMIT $${params.length}`;
      }

      const { rows } = await (await client()).query(text, params);
      return rows.map((row) => ({
        receivedAt: new Date(row.received_at as string | Date).toISOString(),
        payload: (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as Payload,
      }));
    },
    async close() {
      await ownedPool?.end();
    },
  };
}
