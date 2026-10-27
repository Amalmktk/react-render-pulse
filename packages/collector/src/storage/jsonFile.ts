import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { filterBatches, type Storage, type StoredBatch } from "./types.js";

export interface JsonFileStorageOptions {
  /** A JSON Lines file, one stored batch per line. Created (with its folder) on first write. */
  path: string;
}

/**
 * Appends batches to a local JSON Lines file. For local use and small sites;
 * serverless platforms have no persistent disk, so use Postgres there. The
 * file is also what `react-render-pulse-viewer report` reads.
 */
export function jsonFileStorage(options: JsonFileStorageOptions): Storage {
  let writes = Promise.resolve();

  return {
    write(batch) {
      // Writes are chained so concurrent requests never interleave lines.
      writes = writes
        .catch(() => {})
        .then(async () => {
          await mkdir(dirname(options.path), { recursive: true });
          await appendFile(options.path, `${JSON.stringify(batch)}\n`, "utf8");
        });
      return writes;
    },
    async read(query) {
      await writes.catch(() => {});
      return filterBatches(await readJsonLines(options.path), query);
    },
  };
}

/** Reads a JSON Lines file of stored batches, skipping blank or corrupt lines. A missing file reads as empty. */
export async function readJsonLines(path: string): Promise<StoredBatch[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const batches: StoredBatch[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      batches.push(JSON.parse(line) as StoredBatch);
    } catch {
      // A partially written last line (e.g. after a crash) shouldn't hide the rest.
    }
  }
  return batches;
}
