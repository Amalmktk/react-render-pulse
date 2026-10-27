import { filterBatches, type Storage, type StoredBatch } from "./types.js";

/** Keeps batches in memory, for tests and local development. Lost on restart. */
export function memoryStorage(): Storage & { batches: StoredBatch[] } {
  const batches: StoredBatch[] = [];

  return {
    batches,
    async write(batch) {
      batches.push(batch);
    },
    async read(query) {
      return filterBatches(batches, query);
    },
  };
}
