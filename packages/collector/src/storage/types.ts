import type { Payload } from "react-render-pulse/core";

/** A batch as stored: the validated payload plus when the collector received it. */
export interface StoredBatch {
  /** ISO 8601. */
  receivedAt: string;
  payload: Payload;
}

export interface BatchQuery {
  /** Only batches received at or after this time. */
  since?: Date | undefined;
  /** Only batches received before this time. */
  until?: Date | undefined;
  appVersion?: string | undefined;
  /** Most batches returned, newest first. */
  limit?: number | undefined;
}

/** Where batches are kept. Implement it to store them anywhere else. */
export interface Storage {
  write: (batch: StoredBatch) => Promise<void>;
  /** Batches matching `query`, newest first. */
  read: (query?: BatchQuery) => Promise<StoredBatch[]>;
}

/** Applies a `BatchQuery` to batches in memory, for adapters that can't filter at the source. */
export function filterBatches(batches: readonly StoredBatch[], query: BatchQuery = {}): StoredBatch[] {
  const since = query.since?.getTime() ?? -Infinity;
  const until = query.until?.getTime() ?? Infinity;

  const matching = batches
    .filter((batch) => {
      const time = Date.parse(batch.receivedAt);
      if (time < since || time >= until) return false;
      return query.appVersion === undefined || batch.payload.session.appVersion === query.appVersion;
    })
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

  return query.limit === undefined ? matching : matching.slice(0, query.limit);
}
